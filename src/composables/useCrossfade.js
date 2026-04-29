import { ref } from 'vue'

const CROSSFADE_DURATION = 6
const PRELOAD_LEAD_TIME = 20
const CROSSFADE_KEY = 'crossfade_enabled'

const crossfadeEnabled = ref(localStorage.getItem(CROSSFADE_KEY) !== 'false')

let crossfadeAudio = null
let crossfadeAnimationId = null
let isCrossfading = false
let targetVolume = 0.7
let crossfadeNextIndex = -1
let origTrigger = null
let handoffAudio = null
let isHandingOff = false
let preloadedAudioEl = null
let preloadedForIndex = -1
let fadeAnimationId = null

export const useCrossfade = () => {
  const toggleCrossfade = (val) => {
    crossfadeEnabled.value = val
    localStorage.setItem(CROSSFADE_KEY, val)
  }

  const getLoopMode = (ap) => ap.setting ? ap.setting.loop : (ap.options ? ap.options.loop : 'all')

  const clampVolume = (volume) => Math.max(0, Math.min(1, volume))

  const destroyCrossfadeAudio = () => {
    if (crossfadeAudio) {
      crossfadeAudio.pause()
      crossfadeAudio.src = ''
      crossfadeAudio = null
    }
  }

  const destroyHandoffAudio = () => {
    if (handoffAudio) {
      handoffAudio.pause()
      handoffAudio.src = ''
      handoffAudio = null
    }
  }

  const destroyPreloadedAudio = () => {
    if (preloadedAudioEl) {
      preloadedAudioEl.pause()
      preloadedAudioEl.src = ''
      preloadedAudioEl = null
      preloadedForIndex = -1
    }
  }

  const cleanup = (ap) => {
    if (crossfadeAnimationId) {
      cancelAnimationFrame(crossfadeAnimationId)
      crossfadeAnimationId = null
    }
    destroyCrossfadeAudio()
    destroyHandoffAudio()
    destroyPreloadedAudio()
    isHandingOff = false
    if (ap) ap.audio.volume = targetVolume
    isCrossfading = false
    crossfadeNextIndex = -1
    restoreTrigger(ap)
  }

  const interceptTrigger = (ap) => {
    if (origTrigger) return
    origTrigger = ap.events.trigger.bind(ap.events)
    ap.events.trigger = (event, data) => {
      const loop = getLoopMode(ap)
      if (event === 'ended' && isCrossfading && loop !== 'one') {
        handleCrossfadeEnd(ap)
        return
      }
      origTrigger(event, data)
    }
  }

  const restoreTrigger = (ap) => {
    if (origTrigger && ap) {
      ap.events.trigger = origTrigger
      origTrigger = null
    }
  }

  const handleCrossfadeEnd = (ap) => {
    const nextIdx = crossfadeNextIndex
    if (nextIdx === -1 || !crossfadeAudio) {
      cleanup(ap)
      return
    }

    const tempAudio = crossfadeAudio
    crossfadeAudio = null
    isCrossfading = false
    crossfadeNextIndex = -1
    tempAudio.volume = targetVolume

    if (crossfadeAnimationId) {
      cancelAnimationFrame(crossfadeAnimationId)
      crossfadeAnimationId = null
    }
    restoreTrigger(ap)

    isHandingOff = true
    ap.audio.volume = 0
    ap.list.switch(nextIdx)
    handoffAudio = tempAudio

    let handoffDone = false
    let handoffTimer = null
    let seekTimer = null
    let activeAudio = null

    const finishHandoff = () => {
      if (handoffDone || !handoffAudio) return
      handoffDone = true
      if (handoffTimer) { clearTimeout(handoffTimer); handoffTimer = null }
      if (seekTimer) { clearTimeout(seekTimer); seekTimer = null }
      if (activeAudio) {
        activeAudio.removeEventListener('loadedmetadata', doSeekAndHandoff)
        activeAudio.removeEventListener('canplay', doSeekAndHandoff)
        activeAudio.removeEventListener('seeked', finishHandoff)
        activeAudio = null
      }
      handoffAudio.pause()
      handoffAudio.src = ''
      handoffAudio = null
      ap.audio.volume = targetVolume
      isHandingOff = false
      ap.play()
    }

    const doSeekAndHandoff = () => {
      if (handoffDone || !handoffAudio) return
      activeAudio = ap.audio
      const targetTime = Math.max(0, handoffAudio.currentTime)

      try {
        activeAudio.currentTime = targetTime
      } catch (e) {
        handoffTimer = setTimeout(doSeekAndHandoff, 250)
        return
      }

      if (!activeAudio.seeking || Math.abs(activeAudio.currentTime - targetTime) < 0.25) {
        finishHandoff()
      } else {
        activeAudio.addEventListener('seeked', finishHandoff, { once: true })
        seekTimer = setTimeout(() => finishHandoff(), 3000)
      }
    }

    const armHandoff = () => {
      activeAudio = ap.audio
      ap.audio.volume = 0
      try {
        const playPromise = ap.play()
        if (playPromise && playPromise.catch) playPromise.catch(() => { })
      } catch (e) { }

      if (activeAudio.readyState >= 1) {
        doSeekAndHandoff()
      } else {
        activeAudio.addEventListener('loadedmetadata', doSeekAndHandoff, { once: true })
        activeAudio.addEventListener('canplay', doSeekAndHandoff, { once: true })
        handoffTimer = setTimeout(doSeekAndHandoff, 5000)
      }
    }

    setTimeout(armHandoff, 0)
  }

  const startCrossfade = (ap) => {
    if (getLoopMode(ap) === 'one' || ap.list.audios.length <= 1) return
    const nextIndex = ap.nextIndex()
    if (nextIndex === undefined || nextIndex === null) return

    const audio = ap.audio
    if (!audio || !Number.isFinite(audio.duration)) return

    const remaining = audio.duration - audio.currentTime
    if (remaining <= 0.5 || remaining > CROSSFADE_DURATION + 0.5) return

    isCrossfading = true
    crossfadeNextIndex = nextIndex
    targetVolume = audio.volume
    interceptTrigger(ap)

    const nextSong = ap.list.audios[nextIndex]
    if (preloadedAudioEl && preloadedForIndex === nextIndex) {
      crossfadeAudio = preloadedAudioEl
      preloadedAudioEl = null
      preloadedForIndex = -1
    } else {
      destroyPreloadedAudio()
      crossfadeAudio = new Audio(nextSong.url)
      crossfadeAudio.preload = 'auto'
    }
    crossfadeAudio.currentTime = 0
    crossfadeAudio.volume = clampVolume(targetVolume * 0.5)
    crossfadeAudio.play().catch(() => {
      cleanup(ap)
    })

    const startTime = Date.now()
    const duration = Math.max(0.2, Math.min(CROSSFADE_DURATION, remaining)) * 1000

    const animate = () => {
      if (!isCrossfading) return
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)
      const ease = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2

      ap.audio.volume = clampVolume(targetVolume * (1 - ease))
      if (crossfadeAudio) {
        crossfadeAudio.volume = clampVolume(targetVolume * (0.5 + 0.5 * ease))
      }

      if (progress < 1) {
        crossfadeAnimationId = requestAnimationFrame(animate)
      }
    }
    crossfadeAnimationId = requestAnimationFrame(animate)
  }

  const setupCrossfade = (ap) => {
    let crossfadeTriggered = false

    ap.on('timeupdate', () => {
      if (!crossfadeEnabled.value || isCrossfading || handoffAudio) return
      const audio = ap.audio
      const remaining = audio.duration - audio.currentTime
      if (!Number.isFinite(remaining)) return
      if (remaining <= PRELOAD_LEAD_TIME && remaining > CROSSFADE_DURATION + 1 && audio.duration > CROSSFADE_DURATION + 2 && !preloadedAudioEl) {
        const loop = getLoopMode(ap)
        const idx = ap.nextIndex()
        if (idx !== undefined && idx !== null && loop !== 'one' && ap.list.audios.length > 1) {
          preloadedAudioEl = new Audio(ap.list.audios[idx].url)
          preloadedAudioEl.preload = 'auto'
          preloadedForIndex = idx
        }
      }
      if (
        remaining <= CROSSFADE_DURATION &&
        remaining > 0.5 &&
        audio.duration > CROSSFADE_DURATION + 2 &&
        !crossfadeTriggered
      ) {
        const loop = getLoopMode(ap)
        if (loop !== 'one') {
          crossfadeTriggered = true
          startCrossfade(ap)
        }
      }
      if (remaining > CROSSFADE_DURATION + 1) {
        crossfadeTriggered = false
      }
      if (remaining > PRELOAD_LEAD_TIME) {
        destroyPreloadedAudio()
      }
    })

    ap.on('listswitch', () => {
      if (isHandingOff) {
        crossfadeTriggered = false
        return
      }
      if (isCrossfading || handoffAudio) {
        cleanup(ap)
      }
      crossfadeTriggered = false
    })

    ap.on('pause', () => {
      if (isHandingOff) return
      if (crossfadeAudio) crossfadeAudio.pause()
      if (handoffAudio) handoffAudio.pause()
    })

    ap.on('play', () => {
      if (isHandingOff) return
      if (crossfadeAudio) crossfadeAudio.play().catch(() => { })
      if (handoffAudio) handoffAudio.play().catch(() => { })
    })
  }

  const shouldAnimateAudio = () => typeof document === 'undefined' || document.visibilityState === 'visible'

  const fadeMusicOut = (ap, durationInSec = 2, options = {}) => {
    if (!ap || ap.audio.paused) return
    if (isCrossfading) cleanup(ap)
    if (fadeAnimationId) { cancelAnimationFrame(fadeAnimationId); fadeAnimationId = null }
    const origVol = ap.audio.volume
    ap._fadeLastVolume = origVol
    if (options.immediate || !shouldAnimateAudio()) {
      ap.audio.volume = 0
      try { ap.pause() } catch (e) { }
      return
    }
    const start = Date.now()
    const tgt = durationInSec * 1000
    const outAnim = () => {
      const p = Math.min((Date.now() - start) / tgt, 1)
      ap.audio.volume = Math.max(0, origVol * (1 - p))
      if (p < 1) fadeAnimationId = requestAnimationFrame(outAnim)
      else { fadeAnimationId = null; ap.pause() }
    }
    fadeAnimationId = requestAnimationFrame(outAnim)
  }

  const fadeMusicIn = (ap, targetVol = null, durationInSec = 2, options = {}) => {
    if (!ap) return
    if (fadeAnimationId) { cancelAnimationFrame(fadeAnimationId); fadeAnimationId = null }
    const finalVol = targetVol !== null ? targetVol : (ap._fadeLastVolume || 0.7)
    if (options.immediate || !shouldAnimateAudio()) {
      ap.audio.volume = finalVol
      if (ap.audio.paused) { try { const p = ap.play(); if (p && p.catch) p.catch(() => { }) } catch (e) { } }
      return
    }
    ap.audio.volume = 0
    if (ap.audio.paused) { try { const p = ap.play(); if (p && p.catch) p.catch(() => {}) } catch(e) {} }
    const start = Date.now()
    const tgt = durationInSec * 1000
    const inAnim = () => {
      const p = Math.min((Date.now() - start) / tgt, 1)
      ap.audio.volume = finalVol * p
      if (p < 1) fadeAnimationId = requestAnimationFrame(inAnim)
      else fadeAnimationId = null
    }
    fadeAnimationId = requestAnimationFrame(inAnim)
  }

  return {
    crossfadeEnabled,
    toggleCrossfade,
    setupCrossfade,
    cleanup,
    fadeMusicOut,
    fadeMusicIn
  }
}
