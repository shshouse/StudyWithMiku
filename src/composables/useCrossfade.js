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

  const cleanup = (ap) => {
    if (crossfadeAnimationId) {
      cancelAnimationFrame(crossfadeAnimationId)
      crossfadeAnimationId = null
    }
    destroyCrossfadeAudio()
    destroyHandoffAudio()
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
      if (event === 'ended' && isCrossfading) {
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

    const finishHandoff = () => {
      if (!handoffAudio) return
      ap.audio.volume = targetVolume
      handoffAudio.pause()
      handoffAudio.src = ''
      handoffAudio = null
      isHandingOff = false
      ap.play()
    }

    const doSeekAndHandoff = () => {
      if (!handoffAudio) return
      ap.audio.currentTime = handoffAudio.currentTime
      if (!ap.audio.seeking) {
        finishHandoff()
      } else {
        ap.audio.addEventListener('seeked', finishHandoff, { once: true })
        setTimeout(() => finishHandoff(), 3000)
      }
    }

    if (ap.audio.readyState >= 3) {
      doSeekAndHandoff()
    } else {
      ap.audio.addEventListener('canplay', doSeekAndHandoff, { once: true })
      setTimeout(() => finishHandoff(), 5000)
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
      crossfadeAudio = new Audio(nextSong.url)
      crossfadeAudio.preload = 'auto'
    }
    crossfadeAudio.volume = 0
    crossfadeAudio.play().catch(() => {})

    const startTime = Date.now()
    const duration = CROSSFADE_DURATION * 1000

    const animate = () => {
      if (!isCrossfading) return
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)
      const ease = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2

      ap.audio.volume = Math.max(0, targetVolume * (1 - ease))
      if (crossfadeAudio) {
        crossfadeAudio.volume = targetVolume * (0.5 + 0.5 * ease)
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
        const idx = ap.nextIndex()
        if (idx !== undefined && idx !== null && ap.loop !== 'one' && ap.list.audios.length > 1) {
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
        crossfadeTriggered = true
        startCrossfade(ap)
      }
      if (remaining > CROSSFADE_DURATION + 1) {
        crossfadeTriggered = false
      }
      if (remaining > 15) {
        if (preloadedAudioEl) {
          preloadedAudioEl.src = ''
          preloadedAudioEl = null
          preloadedForIndex = -1
        }
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
      if (crossfadeAudio) crossfadeAudio.play().catch(() => {})
      if (handoffAudio) handoffAudio.play().catch(() => {})
    })
  }

  return {
    crossfadeEnabled,
    toggleCrossfade,
    setupCrossfade,
    cleanup
  }
}
