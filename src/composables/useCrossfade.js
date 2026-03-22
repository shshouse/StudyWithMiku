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
let tempTakeover = false
let tempTakeoverAudio = null
let tempSyncRafId = null
let origSeek = null
let takeoverAp = null
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

  const stopTempTakeover = () => {
    if (tempSyncRafId) {
      cancelAnimationFrame(tempSyncRafId)
      tempSyncRafId = null
    }
    if (tempTakeoverAudio) {
      tempTakeoverAudio.pause()
      tempTakeoverAudio.src = ''
      tempTakeoverAudio = null
    }
    if (origSeek && takeoverAp) {
      takeoverAp.seek = origSeek
      delete takeoverAp.duration
      origSeek = null
      takeoverAp = null
    }
    tempTakeover = false
  }

  const cleanup = (ap) => {
    if (crossfadeAnimationId) {
      cancelAnimationFrame(crossfadeAnimationId)
      crossfadeAnimationId = null
    }
    destroyCrossfadeAudio()
    stopTempTakeover()
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

  const formatTime = (s) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return (m < 10 ? '0' + m : m) + ':' + (sec < 10 ? '0' + sec : sec)
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
    const origSetAudio = ap.setAudio
    ap.setAudio = () => {}
    ap.list.switch(nextIdx)
    ap.setAudio = origSetAudio
    ap.setUIPlaying()
    tempTakeover = true
    tempTakeoverAudio = tempAudio
    takeoverAp = ap
    origSeek = ap.seek.bind(ap)
    ap.seek = (time) => {
      if (tempTakeoverAudio) {
        const dur = tempTakeoverAudio.duration
        if (!isNaN(dur) && dur > 0) {
          time = Math.max(0, Math.min(time, dur))
          tempTakeoverAudio.currentTime = time
        }
      }
    }
    Object.defineProperty(ap, 'duration', {
      get: () => {
        if (tempTakeoverAudio && !isNaN(tempTakeoverAudio.duration)) return tempTakeoverAudio.duration
        return isNaN(ap.audio.duration) ? 0 : ap.audio.duration
      },
      configurable: true
    })
    const syncUI = () => {
      if (!tempTakeover || !tempTakeoverAudio) return
      const t = tempTakeoverAudio
      if (!isNaN(t.duration) && t.duration > 0) {
        ap.bar.set('played', t.currentTime / t.duration, 'width')
        ap.template.ptime.innerHTML = formatTime(t.currentTime)
        ap.template.dtime.innerHTML = formatTime(t.duration)
        if (ap.lrc) ap.lrc.update(t.currentTime)
      }
      tempSyncRafId = requestAnimationFrame(syncUI)
    }
    tempSyncRafId = requestAnimationFrame(syncUI)
    tempAudio.addEventListener('ended', () => {
      stopTempTakeover()
      const nextNextIdx = ap.nextIndex()
      ap.list.switch(nextNextIdx)
      ap.audio.volume = targetVolume
      ap.play()
    }, { once: true })
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
        crossfadeAudio.volume = Math.min(targetVolume, targetVolume * ease)
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
      if (!crossfadeEnabled.value || isCrossfading || tempTakeover) return
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
      if (tempTakeover) {
        stopTempTakeover()
        ap.audio.volume = targetVolume
      } else if (isCrossfading) {
        cleanup(ap)
      }
      crossfadeTriggered = false
    })

    ap.on('pause', () => {
      if (tempTakeover && tempTakeoverAudio) {
        tempTakeoverAudio.pause()
      }
    })

    ap.on('play', () => {
      if (tempTakeover && tempTakeoverAudio) {
        tempTakeoverAudio.play().catch(() => {})
      }
    })
  }

  return {
    crossfadeEnabled,
    toggleCrossfade,
    setupCrossfade,
    cleanup
  }
}
