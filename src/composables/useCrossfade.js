import { ref } from 'vue'

const CROSSFADE_DURATION = 6
const PRELOAD_LEAD_TIME = 20
const CROSSFADE_KEY = 'crossfade_enabled'
const MANUAL_FADE_SEC = 1.5
const DUCK_FADE_MS = 300
const DUCK_RATIO = 0.2

const crossfadeEnabled = ref(localStorage.getItem(CROSSFADE_KEY) !== 'false')

let crossfadeAudio = null
let crossfadeAnimationId = null
let isCrossfading = false
let crossfadeNextIndex = -1
let origTrigger = null
let handoffAudio = null
let isHandingOff = false
let preloadedAudioEl = null
let preloadedForIndex = -1
let fadeAnimationId = null
let crossfadeEndFallbackTimer = null
let isCrossfadeListSwitch = false
let origSetAudio = null
let seamlessReadyAudio = null
let seamlessReadyUrl = ''
let doSeekArmed = false
let isSwapping = false
let crossfadeTimerId = null
let overlapPreSwitchedAudio = null
let watchdogTimer = null
let handoffFadeTimer = null
let origVolumeMethod = null

// 用户意图音量：所有程序化淡入淡出都只是临时值，恢复时只认这一个
let userVolume = null
let activePlayer = null
let duckActive = false
let duckRestoreTimer = null

export const useCrossfade = () => {
  const toggleCrossfade = (val) => {
    crossfadeEnabled.value = val
    localStorage.setItem(CROSSFADE_KEY, val)
  }

  const getLoopMode = (ap) => ap.setting ? ap.setting.loop : (ap.options ? ap.options.loop : 'all')

  const clampVolume = (volume) => Math.max(0, Math.min(1, volume))

  const suppressVolumeSave = (ap, duration = 500) => {
    if (!ap) return
    ap._mikuSuppressVolumeSaveUntil = Math.max(ap._mikuSuppressVolumeSaveUntil || 0, Date.now() + duration)
  }

  const rememberUserVolume = (volume) => {
    if (Number.isFinite(volume)) userVolume = clampVolume(volume)
  }

  const getUserVolume = (ap) => {
    if (userVolume === null) {
      const current = ap?.audio?.volume
      userVolume = Number.isFinite(current) ? clampVolume(current) : 0.7
    }
    return userVolume
  }

  const setPlayerVolume = (ap, volume, duration = 500) => {
    if (!ap?.audio) return
    suppressVolumeSave(ap, duration)
    ap.audio.volume = clampVolume(volume)
  }

  const restoreUserVolume = (ap) => {
    if (!ap?.audio) return
    const target = getUserVolume(ap)
    if (Math.abs(ap.audio.volume - target) > 0.001) setPlayerVolume(ap, target)
  }

  const isProgramControllingVolume = () =>
    isCrossfading || isHandingOff || !!handoffAudio || !!crossfadeAudio ||
    fadeAnimationId !== null || crossfadeAnimationId !== null || crossfadeTimerId !== null || isSwapping || duckActive

  const clearCrossfadeEndFallback = () => {
    if (crossfadeEndFallbackTimer) {
      clearTimeout(crossfadeEndFallbackTimer)
      crossfadeEndFallbackTimer = null
    }
  }

  const clearFadeAnim = () => {
    if (crossfadeAnimationId) {
      cancelAnimationFrame(crossfadeAnimationId)
      crossfadeAnimationId = null
    }
    if (crossfadeTimerId) {
      clearInterval(crossfadeTimerId)
      crossfadeTimerId = null
    }
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

  const destroySeamlessReady = () => {
    if (seamlessReadyAudio) {
      seamlessReadyAudio.pause()
      seamlessReadyAudio.src = ''
      seamlessReadyAudio = null
      seamlessReadyUrl = ''
    }
  }

  const cleanup = (ap, onMediaSessionSync) => {
    clearFadeAnim()
    clearCrossfadeEndFallback()
    if (handoffFadeTimer) { clearInterval(handoffFadeTimer); handoffFadeTimer = null }
    cancelDuck()
    destroyCrossfadeAudio()
    destroyHandoffAudio()
    destroyPreloadedAudio()
    destroySeamlessReady()
    isHandingOff = false
    isSwapping = false
    overlapPreSwitchedAudio = null
    setPlayerVolume(ap, getUserVolume(ap))
    isCrossfading = false
    crossfadeNextIndex = -1
    restoreTrigger(ap)
    if (typeof onMediaSessionSync === 'function') onMediaSessionSync()
  }

  const interceptTrigger = (ap, onMediaSessionSync) => {
    if (origTrigger) return
    origTrigger = ap.events.trigger.bind(ap.events)
    ap.events.trigger = (event, data) => {
      const loop = getLoopMode(ap)
      if (event === 'ended' && isCrossfading && loop !== 'one') {
        handleCrossfadeEnd(ap, onMediaSessionSync)
        return
      }
      origTrigger(event, data)
    }
  }

  const interceptSetAudio = (ap, onMediaSessionSync) => {
    if (origSetAudio) return
    origSetAudio = ap.setAudio.bind(ap)
    ap.setAudio = (nextAudio) => {
      const main = ap.audio
      const nextUrl = nextAudio?.url
      const progBusy = isCrossfading || isHandingOff || !!handoffAudio || isSwapping
      const endedAdvance = !!(main && main.ended && getLoopMode(ap) === 'all')
      if (!seamlessEnabled() || progBusy || !main || (!endedAdvance && main.paused) || !nextUrl) {
        origSetAudio(nextAudio)
        return
      }
      const canSeamless = seamlessReadyAudio && seamlessReadyUrl === nextUrl && seamlessReadyAudio.readyState >= 2
      if (!canSeamless) {
        if (startOverlapSwitch(ap, nextAudio, onMediaSessionSync, endedAdvance)) return
        origSetAudio(nextAudio)
        return
      }
      const takeOver = seamlessReadyAudio
      seamlessReadyAudio = null
      seamlessReadyUrl = ''
      isSwapping = true
      const startVolume = main.volume
      const targetVolume = getUserVolume(ap)
      takeOver.volume = startVolume
      const p = takeOver.play()
      if (p && p.catch) p.catch(() => { })
      setPlayerVolume(ap, 0, 5000)
      origSetAudio(nextAudio)
      const swapStart = Date.now()
      const SWAP_MS = 400
      let swapDone = false
      const finishSwap = () => {
        if (swapDone) return
        swapDone = true
        isSwapping = false
        clearInterval(swapTimer)
        takeOver.pause()
        takeOver.src = ''
        setPlayerVolume(ap, getUserVolume(ap), 800)
        if (main.paused && !main.ended) {
          const rp = main.play()
          if (rp && rp.catch) rp.catch(() => { })
        }
        if (typeof onMediaSessionSync === 'function') onMediaSessionSync()
      }
      const swapTimer = setInterval(() => {
        if (swapDone || !takeOver.src) { finishSwap(); return }
        const progress = Math.min((Date.now() - swapStart) / SWAP_MS, 1)
        setPlayerVolume(ap, targetVolume * progress, 1000)
        takeOver.volume = clampVolume(targetVolume * (1 - progress))
        if (progress >= 1) finishSwap()
      }, 50)
      setTimeout(finishSwap, 2000)
    }
  }

  const seamlessEnabled = () => crossfadeEnabled.value

  const restoreTrigger = (ap) => {
    if (origTrigger && ap) {
      ap.events.trigger = origTrigger
      origTrigger = null
    }
  }

  const handleCrossfadeEnd = (ap, onMediaSessionSync) => {
    clearCrossfadeEndFallback()
    doSeekArmed = false
    const nextIdx = crossfadeNextIndex
    if (nextIdx === -1 || !crossfadeAudio) {
      cleanup(ap, onMediaSessionSync)
      return
    }

    const tempAudio = crossfadeAudio
    crossfadeAudio = null
    isCrossfading = false
    crossfadeNextIndex = -1
    tempAudio.volume = getUserVolume(ap)
    destroySeamlessReady()

    if (crossfadeAnimationId || crossfadeTimerId) {
      clearFadeAnim()
    }
    restoreTrigger(ap)

    isHandingOff = true
    setPlayerVolume(ap, 0, 8000)
    if (overlapPreSwitchedAudio) {
      const pre = overlapPreSwitchedAudio
      overlapPreSwitchedAudio = null
      let abs = pre.url
      try { abs = new URL(pre.url, window.location.href).href } catch (e) { }
      if (ap.audio.src !== abs) origSetAudio(pre)
    } else {
      isCrossfadeListSwitch = true
      ap.list.switch(nextIdx)
      isCrossfadeListSwitch = false
    }
    handoffAudio = tempAudio

    let handoffDone = false
    let handoffTimer = null
    let seekTimer = null
    let handoffFallbackTimer = null
    let activeAudio = null

    const finishHandoff = () => {
      if (handoffDone || !handoffAudio) return
      handoffDone = true
      if (handoffFadeTimer) { clearInterval(handoffFadeTimer); handoffFadeTimer = null }
      if (handoffTimer) { clearTimeout(handoffTimer); handoffTimer = null }
      if (seekTimer) { clearTimeout(seekTimer); seekTimer = null }
      if (handoffFallbackTimer) { clearTimeout(handoffFallbackTimer); handoffFallbackTimer = null }
      if (activeAudio) {
        activeAudio.removeEventListener('loadedmetadata', doSeekAndHandoff)
        activeAudio.removeEventListener('canplay', doSeekAndHandoff)
        activeAudio.removeEventListener('seeked', beginMiniHandoffFade)
        activeAudio = null
      }
      handoffAudio.pause()
      handoffAudio.src = ''
      handoffAudio = null
      restoreUserVolume(ap)
      isHandingOff = false
      if (!ap.audio.paused) {
        try {
          const playPromise = ap.play()
          if (playPromise && playPromise.catch) playPromise.catch(() => { })
        } catch (e) { }
      }
      if (typeof onMediaSessionSync === 'function') onMediaSessionSync()
    }

    const beginMiniHandoffFade = () => {
      if (handoffDone || !handoffAudio) return
      if (seekTimer) { clearTimeout(seekTimer); seekTimer = null }
      if (activeAudio) activeAudio.removeEventListener('seeked', beginMiniHandoffFade)
      if (ap.audio.paused) {
        try {
          const pp = ap.play()
          if (pp && pp.catch) pp.catch(() => { })
        } catch (e) { }
      }
      if (document.visibilityState !== 'visible') {
        setPlayerVolume(ap, getUserVolume(ap))
        handoffAudio.volume = 0
        finishHandoff()
        return
      }
      const startVol = handoffAudio.volume
      const targetVolume = getUserVolume(ap)
      const start = Date.now()
      const FADE_MS = 400
      if (handoffFadeTimer) clearInterval(handoffFadeTimer)
      handoffFadeTimer = setInterval(() => {
        if (handoffDone) { clearInterval(handoffFadeTimer); handoffFadeTimer = null; return }
        const p = Math.min((Date.now() - start) / FADE_MS, 1)
        if (handoffAudio) handoffAudio.volume = ap.audio.paused ? startVol : clampVolume(startVol * (1 - p))
        setPlayerVolume(ap, targetVolume * p, 1000)
        if (p >= 1) finishHandoff()
      }, 50)
    }

    const doSeekAndHandoff = () => {
      if (handoffDone || !handoffAudio || doSeekArmed) return
      doSeekArmed = true
      activeAudio = ap.audio
      const targetTime = Math.max(0, handoffAudio.currentTime)

      try {
        activeAudio.currentTime = targetTime
      } catch (e) {
        doSeekArmed = false
        handoffTimer = setTimeout(doSeekAndHandoff, 250)
        return
      }

      if (!activeAudio.seeking || Math.abs(activeAudio.currentTime - targetTime) < 0.25) {
        beginMiniHandoffFade()
      } else {
        activeAudio.addEventListener('seeked', beginMiniHandoffFade, { once: true })
        seekTimer = setTimeout(() => beginMiniHandoffFade(), 3000)
      }
    }

    const armHandoff = () => {
      if (!handoffAudio) return
      activeAudio = ap.audio
      setPlayerVolume(ap, 0, 8000)
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

    handoffFallbackTimer = setTimeout(() => finishHandoff(), 7000)
    armHandoff()
  }
  const beginFade = (ap, durationMs, startVolume, targetVolume) => {
    clearFadeAnim()
    setPlayerVolume(ap, startVolume, 8000)
    if (crossfadeAudio) crossfadeAudio.volume = 0
    const startTime = Date.now()
    const animate = () => {
      if (!isCrossfading) return
      const progress = Math.min((Date.now() - startTime) / durationMs, 1)
      const ease = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2

      setPlayerVolume(ap, startVolume * (1 - ease), 8000)
      if (crossfadeAudio) {
        crossfadeAudio.volume = clampVolume(targetVolume * ease)
      }

      if (progress >= 1) {
        clearFadeAnim()
      } else if (!crossfadeTimerId) {
        crossfadeAnimationId = requestAnimationFrame(animate)
      }
    }
    if (document.visibilityState === 'visible') {
      crossfadeAnimationId = requestAnimationFrame(animate)
    } else {
      crossfadeTimerId = setInterval(animate, 200)
    }
  }

  const startCrossfade = (ap, onMediaSessionSync) => {
    if (getLoopMode(ap) === 'one' || ap.list.audios.length <= 1) return
    const nextIndex = ap.nextIndex()
    if (nextIndex === undefined || nextIndex === null) return

    const audio = ap.audio
    if (!audio || !Number.isFinite(audio.duration)) return

    const remaining = audio.duration - audio.currentTime
    if (remaining <= 0.5 || remaining > CROSSFADE_DURATION + 0.5) return

    isCrossfading = true
    crossfadeNextIndex = nextIndex
    cancelDuck()
    interceptTrigger(ap, onMediaSessionSync)

    const startVolume = audio.volume
    const targetVolume = getUserVolume(ap)
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
      cleanup(ap, onMediaSessionSync)
    })

    const duration = Math.max(0.2, Math.min(CROSSFADE_DURATION, remaining)) * 1000
    beginFade(ap, duration, startVolume, targetVolume)
    crossfadeEndFallbackTimer = setTimeout(() => {
      if (isCrossfading && crossfadeAudio) {
        handleCrossfadeEnd(ap, onMediaSessionSync)
      }
    }, duration + 1200)
  }

  const startOverlapSwitch = (ap, nextAudio, onMediaSessionSync, immediate = false) => {
    const main = ap.audio
    const idx = ap.list.audios.indexOf(nextAudio)
    if (idx === -1 || !nextAudio.url || !main || ap.list.audios.length <= 1) return false
    if (main.paused && !main.ended) return false
    if (main.ended && getLoopMode(ap) !== 'all') return false

    let el = null
    if (seamlessReadyAudio && seamlessReadyUrl === nextAudio.url) {
      el = seamlessReadyAudio
      destroySeamlessReady()
    } else if (preloadedAudioEl && preloadedForIndex === idx) {
      el = preloadedAudioEl
      preloadedAudioEl = null
      preloadedForIndex = -1
    }
    if (!el) {
      destroyPreloadedAudio()
      destroySeamlessReady()
      el = new Audio(nextAudio.url)
      el.preload = 'auto'
    }

    isCrossfading = true
    crossfadeNextIndex = idx
    overlapPreSwitchedAudio = nextAudio
    cancelDuck()
    interceptTrigger(ap, onMediaSessionSync)
    crossfadeAudio = el
    const startVolume = main.volume
    const targetVolume = getUserVolume(ap)
    try { el.currentTime = 0 } catch (e) { }
    el.volume = clampVolume(targetVolume * 0.5)
    const start = Date.now()
    const p = el.play()
    if (p && p.catch) p.catch(() => { })

    if (immediate) {
      setPlayerVolume(ap, 0, 8000)
      origSetAudio(nextAudio)
    } else {
      const fadeMs = MANUAL_FADE_SEC * 1000
      beginFade(ap, fadeMs, startVolume, targetVolume)
    }

    const fire = () => {
      clearCrossfadeEndFallback()
      if (!isCrossfading || !crossfadeAudio) return
      const minWait = immediate ? 0 : MANUAL_FADE_SEC * 1000
      if (Date.now() - start < minWait && document.visibilityState === 'visible') {
        crossfadeEndFallbackTimer = setTimeout(fire, minWait - (Date.now() - start) + 100)
        return
      }
      handleCrossfadeEnd(ap, onMediaSessionSync)
    }
    el.addEventListener('playing', fire, { once: true })
    if (p && p.then) p.then(fire)
    crossfadeEndFallbackTimer = setTimeout(fire, (immediate ? 0.5 : MANUAL_FADE_SEC + 0.5) * 1000)
    return true
  }

  const interceptVolume = (ap) => {
    if (origVolumeMethod) return
    origVolumeMethod = ap.volume.bind(ap)
    ap.volume = (percentage, nostorage) => {
      const result = origVolumeMethod(percentage, nostorage)
      // APlayer 的音量条与音量图标最终都走这里，视为用户意图
      if (Number.isFinite(parseFloat(percentage))) rememberUserVolume(ap.audio.volume)
      return result
    }
  }

  const setupCrossfade = (ap, onMediaSessionSync) => {
    let crossfadeTriggered = false
    activePlayer = ap
    interceptSetAudio(ap, onMediaSessionSync)
    interceptVolume(ap)
    rememberUserVolume(ap.audio.volume)

    if (!watchdogTimer) {
      watchdogTimer = setInterval(() => {
        const a = ap.audio
        if (!a || a.paused || isProgramControllingVolume()) return
        const target = getUserVolume(ap)
        if (Math.abs(a.volume - target) > 0.02) {
          console.warn('[useCrossfade] 播放音量与用户设置不一致，已恢复', a.volume.toFixed(2), '->', target)
          setPlayerVolume(ap, target)
        }
      }, 4000)
    }

    ap.on('timeupdate', () => {
      if (!crossfadeEnabled.value || isCrossfading || handoffAudio) return
      const audio = ap.audio
      const remaining = audio.duration - audio.currentTime
      if (!Number.isFinite(remaining)) return
      // 预加载下一首，供 seamless setAudio 与 crossfade 共用
      if (remaining <= PRELOAD_LEAD_TIME && remaining > CROSSFADE_DURATION + 1 && audio.duration > CROSSFADE_DURATION + 2 && !preloadedAudioEl && !seamlessReadyAudio) {
        const loop = getLoopMode(ap)
        const idx = ap.nextIndex()
        if (idx !== undefined && idx !== null && loop !== 'one' && ap.list.audios.length > 1) {
          preloadedAudioEl = new Audio(ap.list.audios[idx].url)
          preloadedAudioEl.preload = 'auto'
          preloadedForIndex = idx
        }
      }
      // 把预加载元素登记为 seamless 候选（readyState 达标才可用于无缝切换）
      if (preloadedAudioEl && preloadedAudioEl.readyState >= 2 && seamlessReadyUrl !== ap.list.audios[preloadedForIndex]?.url) {
        destroySeamlessReady()
        seamlessReadyAudio = preloadedAudioEl
        seamlessReadyUrl = ap.list.audios[preloadedForIndex]?.url || ''
        preloadedAudioEl = null
        preloadedForIndex = -1
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
          startCrossfade(ap, onMediaSessionSync)
        }
      }
      if (remaining > CROSSFADE_DURATION + 1) {
        crossfadeTriggered = false
        if (isCrossfading) cleanup(ap, onMediaSessionSync)
      }
      if (remaining > PRELOAD_LEAD_TIME) {
        destroyPreloadedAudio()
      }
    })
    ap.on('progress', () => {
      if (!crossfadeEnabled.value || isCrossfading || handoffAudio || preloadedAudioEl || seamlessReadyAudio) return
      const audio = ap.audio
      if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return
      const loop = getLoopMode(ap)
      const idx = ap.nextIndex()
      if (idx === undefined || idx === null || loop === 'one' || ap.list.audios.length <= 1) return
      try {
        const buf = audio.buffered
        if (buf.length && buf.end(buf.length - 1) >= audio.duration - 15) {
          preloadedAudioEl = new Audio(ap.list.audios[idx].url)
          preloadedAudioEl.preload = 'auto'
          preloadedForIndex = idx
        }
      } catch (e) { }
    })

    ap.on('listswitch', () => {
      if (isCrossfadeListSwitch) {
        crossfadeTriggered = false
        return
      }
      if (isCrossfading || isHandingOff || handoffAudio) {
        cleanup(ap, onMediaSessionSync)
      }
      crossfadeTriggered = false
    })

    ap.on('pause', () => {
      if (isHandingOff) {
        if (handoffAudio) handoffAudio.pause()
        return
      }
      if (isCrossfading) {
        const a = ap.audio
        if (a.ended || (Number.isFinite(a.duration) && a.duration - a.currentTime < 0.5)) return
        cleanup(ap, onMediaSessionSync)
        return
      }
      if (crossfadeAudio) crossfadeAudio.pause()
      if (handoffAudio) handoffAudio.pause()
    })

    ap.on('play', () => {
      if (isHandingOff) {
        if (handoffAudio) handoffAudio.play().catch(() => { })
        return
      }
      if (crossfadeAudio) crossfadeAudio.play().catch(() => { })
      if (handoffAudio) handoffAudio.play().catch(() => { })
      if (!isProgramControllingVolume()) restoreUserVolume(ap)
    })
  }

  const shouldAnimateAudio = () => typeof document === 'undefined' || document.visibilityState === 'visible'

  const playIfPaused = (ap) => {
    if (!ap.audio.paused) return
    try {
      const p = ap.play()
      if (p && p.catch) p.catch(() => { })
    } catch (e) { }
  }

  const fadeMusicOut = (ap, durationInSec = 2, options = {}) => {
    if (!ap || ap.audio.paused) return
    if (isCrossfading || isHandingOff || handoffAudio) cleanup(ap)
    cancelDuck()
    if (fadeAnimationId) { cancelAnimationFrame(fadeAnimationId); fadeAnimationId = null }
    clearFadeAnim()
    const startVolume = ap.audio.volume
    if (options.immediate || !shouldAnimateAudio()) {
      setPlayerVolume(ap, 0)
      try { ap.pause() } catch (e) { }
      return
    }
    const start = Date.now()
    const tgt = durationInSec * 1000
    const outAnim = () => {
      const p = Math.min((Date.now() - start) / tgt, 1)
      setPlayerVolume(ap, Math.max(0, startVolume * (1 - p)))
      if (p < 1) fadeAnimationId = requestAnimationFrame(outAnim)
      else { fadeAnimationId = null; ap.pause() }
    }
    fadeAnimationId = requestAnimationFrame(outAnim)
  }

  const fadeMusicIn = (ap, targetVol = null, durationInSec = 2, options = {}) => {
    if (!ap) return
    if (fadeAnimationId) { cancelAnimationFrame(fadeAnimationId); fadeAnimationId = null }
    const getTarget = () => (targetVol !== null ? clampVolume(targetVol) : getUserVolume(ap))
    const finalVol = getTarget()
    // 目标为 0 或临近结尾时不做从 0 淡入，避免与交叉淡化抢同一个音量
    const remaining = ap.audio.duration - ap.audio.currentTime
    if (options.immediate || !shouldAnimateAudio() || finalVol <= 0 || (Number.isFinite(remaining) && remaining <= CROSSFADE_DURATION + 1)) {
      setPlayerVolume(ap, finalVol)
      playIfPaused(ap)
      return
    }
    setPlayerVolume(ap, 0)
    playIfPaused(ap)
    const start = Date.now()
    const tgt = durationInSec * 1000
    const inAnim = () => {
      if (isCrossfading || isHandingOff) { fadeAnimationId = null; return }
      const p = Math.min((Date.now() - start) / tgt, 1)
      setPlayerVolume(ap, getTarget() * p)
      if (p < 1) fadeAnimationId = requestAnimationFrame(inAnim)
      else fadeAnimationId = null
    }
    fadeAnimationId = requestAnimationFrame(inAnim)
  }

  const clearDuckRestoreTimer = () => {
    if (duckRestoreTimer) {
      clearTimeout(duckRestoreTimer)
      duckRestoreTimer = null
    }
  }

  const cancelDuck = () => {
    duckActive = false
    clearDuckRestoreTimer()
  }

  const duckMusicForNotification = (notificationDuration = 3000) => {
    const ap = activePlayer
    if (!ap?.audio || ap.audio.paused) return
    if (isProgramControllingVolume()) return
    const target = getUserVolume(ap)
    if (target <= 0) return
    clearDuckRestoreTimer()
    duckActive = true
    const from = ap.audio.volume
    const to = target * DUCK_RATIO
    const start = Date.now()
    const fadeTimer = setInterval(() => {
      if (!duckActive) { clearInterval(fadeTimer); return }
      const p = Math.min((Date.now() - start) / DUCK_FADE_MS, 1)
      setPlayerVolume(ap, from + (to - from) * p)
      if (p < 1) return
      clearInterval(fadeTimer)
      duckRestoreTimer = setTimeout(() => {
        duckRestoreTimer = null
        duckActive = false
        if (!ap || isProgramControllingVolume()) return
        restoreUserVolume(ap)
      }, notificationDuration)
    }, 20)
  }

  return {
    crossfadeEnabled,
    toggleCrossfade,
    setupCrossfade,
    cleanup,
    fadeMusicOut,
    fadeMusicIn,
    duckMusicForNotification
  }
}
