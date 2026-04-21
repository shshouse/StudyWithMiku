import { ref } from 'vue'

const CROSSFADE_DURATION = 5
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
      const loop = ap.setting ? ap.setting.loop : (ap.options ? ap.options.loop : 'all')
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

    const finishHandoff = () => {
      if (handoffDone || !handoffAudio) return
      handoffDone = true
      if (handoffTimer) { clearTimeout(handoffTimer); handoffTimer = null }
      ap.audio.volume = targetVolume
      handoffAudio.pause()
      handoffAudio.src = ''
      handoffAudio = null
      isHandingOff = false
      ap.play()
    }

    const doSeekAndHandoff = () => {
      if (handoffDone || !handoffAudio) return
      ap.audio.currentTime = handoffAudio.currentTime
      if (!ap.audio.seeking) {
        finishHandoff()
      } else {
        ap.audio.addEventListener('seeked', finishHandoff, { once: true })
        handoffTimer = setTimeout(() => finishHandoff(), 3000)
      }
    }

    if (ap.audio.readyState >= 3) {
      doSeekAndHandoff()
    } else {
      ap.audio.addEventListener('canplay', doSeekAndHandoff, { once: true })
      handoffTimer = setTimeout(() => finishHandoff(), 5000)
    }
  }

  const startCrossfade = (ap) => {
    if (ap.loop === 'one' || ap.list.audios.length <= 1) return
    const nextIndex = ap.nextIndex()
    if (nextIndex === undefined || nextIndex === null) return

    isCrossfading = true
    crossfadeNextIndex = nextIndex
    targetVolume = ap.audio.volume
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
    crossfadeAudio.volume = 0
    crossfadeAudio.play().catch(() => {
      cleanup(ap)
    })

    const startTime = Date.now()
    const duration = CROSSFADE_DURATION * 1000

    const animate = () => {
      if (!isCrossfading) return
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)
      const ease = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2

      ap.audio.volume = Math.max(0, targetVolume * Math.cos(ease * Math.PI / 2))
      if (crossfadeAudio) {
        crossfadeAudio.volume = targetVolume * Math.sin(ease * Math.PI / 2)
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
      if (remaining <= 15 && remaining > CROSSFADE_DURATION + 1 && audio.duration > CROSSFADE_DURATION + 2 && !preloadedAudioEl) {
        const loop = ap.setting ? ap.setting.loop : (ap.options ? ap.options.loop : 'all')
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
        const loop = ap.setting ? ap.setting.loop : (ap.options ? ap.options.loop : 'all')
        if (loop !== 'one') {
          crossfadeTriggered = true
          startCrossfade(ap)
        }
      }
      if (remaining > CROSSFADE_DURATION + 1) {
        crossfadeTriggered = false
      }
      if (remaining > 15) {
        destroyPreloadedAudio()
      }
    })

    ap.on('listswitch', () => {
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
