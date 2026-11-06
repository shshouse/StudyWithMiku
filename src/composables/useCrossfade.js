import { ref } from 'vue'

const STORAGE_KEY = 'crossfade_enabled'
const END_FADE_SEC = 6
const PRELOAD_LEAD_SEC = 20
const MANUAL_FADE_SEC = 1.5
const HANDOFF_FADE_MS = 400
const HANDOFF_READY_MS = 3000
const HANDOFF_TIMEOUT_MS = 5000
const DUCK_FADE_MS = 300
const DUCK_RATIO = 0.2
const TICK_MS = 1000

const crossfadeEnabled = ref(localStorage.getItem(STORAGE_KEY) !== 'false')

let player = null
let syncSession = null
let userVolume = null
let userPaused = true
let internalSwitch = false
let applyAudio = null
let reconcileTimer = null
let playerFade = null
let duck = null
let pauseGuardUntil = 0

const fade = {
  phase: 'idle', // idle | fade | handoff
  mode: '', // end | manual
  shadow: null,
  nextIndex: -1,
  pending: null,
  deadline: 0,
  anim: null,
  timers: new Set()
}

let preload = { el: null, index: -1, url: '' }

const nowMs = () => Date.now()
const clampVolume = (value) => Math.max(0, Math.min(1, value))
const isIdle = () => fade.phase === 'idle'
const isProgramControlling = () => !isIdle() || !!playerFade || !!duck
const shouldAnimate = () => typeof document === 'undefined' || document.visibilityState === 'visible'
const loopMode = (ap) => ap?.options?.loop || 'all'

const setVolume = (ap, value, holdMs = 600) => {
  if (!ap?.audio) return
  ap._mikuSuppressVolumeSaveUntil = Math.max(ap._mikuSuppressVolumeSaveUntil || 0, nowMs() + holdMs)
  ap.audio.volume = clampVolume(value)
}

const rememberVolume = (value) => {
  if (Number.isFinite(value)) userVolume = clampVolume(value)
}

const userTargetVolume = (ap) => {
  if (userVolume === null) {
    const current = ap?.audio?.volume
    userVolume = Number.isFinite(current) ? clampVolume(current) : 0.7
  }
  return userVolume
}

const restoreVolume = (ap) => {
  if (!ap?.audio) return
  const target = userTargetVolume(ap)
  if (Math.abs(ap.audio.volume - target) > 0.001) setVolume(ap, target)
}

const later = (fn, ms) => {
  const id = setTimeout(() => {
    fade.timers.delete(id)
    fn()
  }, ms)
  fade.timers.add(id)
  return id
}

const clearTimers = () => {
  fade.timers.forEach((id) => clearTimeout(id))
  fade.timers.clear()
}

const stopAnim = () => {
  if (!fade.anim) return
  clearInterval(fade.anim)
  fade.anim = null
}

const animate = (durationMs, onFrame, onDone) => {
  stopAnim()
  const startedAt = nowMs()
  const total = Math.max(120, durationMs)
  let done = false
  const finish = () => {
    if (done) return
    done = true
    stopAnim()
    onFrame(1)
    if (onDone) onDone()
  }
  fade.anim = setInterval(() => {
    const progress = Math.min((nowMs() - startedAt) / total, 1)
    onFrame(progress)
    if (progress >= 1) finish()
  }, 50)
  later(finish, total + 400)
}

const createAudio = (url) => {
  const el = new Audio(url)
  el.preload = 'auto'
  return el
}

const takePreloaded = (url, index) => {
  if (!preload.el || preload.index !== index || preload.url !== url) return null
  const el = preload.el
  preload = { el: null, index: -1, url: '' }
  return el
}

const dropPreload = () => {
  if (!preload.el) return
  try { preload.el.pause() } catch (e) { }
  try { preload.el.src = '' } catch (e) { }
  preload = { el: null, index: -1, url: '' }
}

const releaseShadow = () => {
  const el = fade.shadow
  fade.shadow = null
  if (!el) return
  try { el.pause() } catch (e) { }
  try { el.src = '' } catch (e) { }
}

const stopPlayerFade = () => {
  if (!playerFade) return
  clearInterval(playerFade.timer)
  playerFade = null
}

const cancelDuck = () => {
  if (!duck) return
  if (duck.timer) clearInterval(duck.timer)
  if (duck.restore) clearTimeout(duck.restore)
  duck = null
}

const settle = ({ apply = true } = {}) => {
  const pending = fade.pending
  const active = !isIdle() || !!pending
  stopAnim()
  clearTimers()
  releaseShadow()
  fade.phase = 'idle'
  fade.mode = ''
  fade.nextIndex = -1
  fade.pending = null
  fade.deadline = 0
  if (!active) return
  const ap = player
  if (!ap) return
  if (apply && pending && applyAudio) {
    pauseGuardUntil = nowMs() + 800
    internalSwitch = true
    try {
      applyAudio(pending)
    } finally {
      internalSwitch = false
    }
  }
  restoreVolume(ap)
  if (syncSession) syncSession()
}

const waitReady = (audio, done) => {
  if (audio.readyState >= 1) {
    done()
    return
  }
  let finished = false
  const finish = () => {
    if (finished) return
    finished = true
    done()
  }
  audio.addEventListener('loadedmetadata', finish, { once: true })
  audio.addEventListener('canplay', finish, { once: true })
  later(finish, HANDOFF_READY_MS)
}

const seekTo = (audio, time, done) => {
  let finished = false
  const finish = () => {
    if (finished) return
    finished = true
    done()
  }
  try {
    audio.currentTime = Math.max(0, time)
  } catch (e) {
    later(finish, 300)
    return
  }
  if (!audio.seeking) {
    finish()
    return
  }
  audio.addEventListener('seeked', finish, { once: true })
  later(finish, 1200)
}

const applyTarget = (ap) => {
  pauseGuardUntil = nowMs() + 800
  internalSwitch = true
  try {
    if (fade.mode === 'manual') {
      const pending = fade.pending
      fade.pending = null
      if (pending && applyAudio) applyAudio(pending)
    } else {
      ap.list.switch(fade.nextIndex)
    }
  } finally {
    internalSwitch = false
  }
}

const handoff = (ap) => {
  if (fade.phase !== 'fade') return
  const shadow = fade.shadow
  const main = ap?.audio
  if (!shadow || !main || userPaused) {
    settle({ apply: true })
    return
  }

  fade.phase = 'handoff'
  fade.deadline = nowMs() + HANDOFF_READY_MS + HANDOFF_TIMEOUT_MS
  setVolume(ap, 0, HANDOFF_TIMEOUT_MS + 1000)
  applyTarget(ap)

  const target = userTargetVolume(ap)
  const resumeAt = shadow.currentTime
  const shadowFrom = shadow.volume

  waitReady(main, () => {
    if (fade.phase !== 'handoff' || fade.shadow !== shadow) return
    seekTo(main, resumeAt, () => {
      if (fade.phase !== 'handoff' || fade.shadow !== shadow) return
      if (main.paused && !userPaused) {
        try { ap.play() } catch (e) { }
      }
      animate(HANDOFF_FADE_MS, (progress) => {
        setVolume(ap, target * progress, 1000)
        if (fade.shadow === shadow) shadow.volume = clampVolume(shadowFrom * (1 - progress))
      }, () => settle({ apply: false }))
    })
  })
}

const beginFade = (ap, { mode, pending, nextIndex, durationMs }) => {
  const main = ap?.audio
  const audio = pending || ap?.list?.audios?.[nextIndex]
  if (!main || !audio?.url) {
    settle({ apply: true })
    return
  }

  const shadow = takePreloaded(audio.url, nextIndex) || createAudio(audio.url)
  fade.phase = 'fade'
  fade.mode = mode
  fade.shadow = shadow
  fade.nextIndex = nextIndex
  fade.pending = mode === 'manual' ? pending : null
  fade.deadline = nowMs() + durationMs + HANDOFF_READY_MS + HANDOFF_TIMEOUT_MS + 2000

  try { shadow.currentTime = 0 } catch (e) { }
  shadow.volume = 0
  const started = shadow.play()
  if (started && started.catch) {
    started.catch(() => {
      if (fade.shadow === shadow && fade.phase === 'fade') settle({ apply: true })
    })
  }

  const startVolume = main.volume
  const target = userTargetVolume(ap)
  animate(durationMs, (progress) => {
    setVolume(ap, startVolume * (1 - progress), durationMs + 1000)
    shadow.volume = clampVolume(target * progress)
  }, () => handoff(ap))
}

const reconcile = () => {
  const ap = player
  if (!ap?.audio) return
  if (!isIdle()) {
    if (userPaused || nowMs() > fade.deadline) settle({ apply: true })
    return
  }
  if (fade.shadow) releaseShadow()
  if (isProgramControlling() || ap.audio.paused) return
  const target = userTargetVolume(ap)
  if (Math.abs(ap.audio.volume - target) > 0.02) {
    console.warn('[useCrossfade] 音量与用户设置不一致，已恢复', ap.audio.volume.toFixed(2), '->', target)
    setVolume(ap, target)
  }
}

const onTimeupdate = () => {
  const ap = player
  if (!ap?.audio || !crossfadeEnabled.value || !isIdle()) return
  const audio = ap.audio
  const remaining = audio.duration - audio.currentTime
  if (!Number.isFinite(remaining)) return

  if (remaining > PRELOAD_LEAD_SEC + 1) {
    dropPreload()
    return
  }

  const list = ap.list?.audios || []
  const index = ap.nextIndex()
  if (loopMode(ap) === 'one' || list.length <= 1 || index === undefined || index === null) return
  if (loopMode(ap) === 'none' && ap.options?.order === 'list' && ap.list.index === list.length - 1) return

  const next = list[index]
  if (!next?.url) return
  if (preload.el && (preload.index !== index || preload.url !== next.url)) dropPreload()

  const longEnough = audio.duration > END_FADE_SEC + 2
  if (longEnough && !preload.el && remaining <= PRELOAD_LEAD_SEC && remaining > END_FADE_SEC + 1) {
    preload = { el: createAudio(next.url), index, url: next.url }
  }
  if (longEnough && !audio.paused && remaining <= END_FADE_SEC && remaining > 0.5) {
    beginFade(ap, {
      mode: 'end',
      pending: null,
      nextIndex: index,
      durationMs: Math.max(200, Math.min(END_FADE_SEC, remaining) * 1000)
    })
  }
}

const isEnding = (audio) => {
  if (!audio) return false
  if (audio.ended) return true
  return Number.isFinite(audio.duration) && audio.duration - audio.currentTime <= 0.3
}

const onPause = () => {
  const ap = player
  if (!ap?.audio) return
  // APlayer 发起暂停时会先置 paused，只有它为 true 才是真正的暂停意图
  if (!ap.paused) return
  userPaused = true
  settle({ apply: true })
}

const onPlay = () => {
  userPaused = false
}

const onListSwitch = () => {
  if (internalSwitch) return
  settle({ apply: false })
  dropPreload()
}

const interceptTrigger = (ap) => {
  if (ap._mikuCrossfadeTrigger) return
  const original = ap.events.trigger.bind(ap.events)
  ap._mikuCrossfadeTrigger = original
  ap.events.trigger = (event, data) => {
    if (event === 'ended' && fade.phase === 'fade') {
      handoff(ap)
      return
    }
    // 换源和歌曲结束都会让浏览器补发 pause，两者都不是用户意图。
    // 放行会让 APlayer 把界面切成暂停并打断正在进行的交接。
    if (event === 'pause' && !ap.paused && (nowMs() < pauseGuardUntil || isEnding(ap.audio))) return
    original(event, data)
  }
}

const interceptSetAudio = (ap) => {
  if (ap._mikuCrossfadeSetAudio) return
  const original = ap.setAudio.bind(ap)
  ap._mikuCrossfadeSetAudio = original
  applyAudio = original
  ap.setAudio = (nextAudio) => {
    if (internalSwitch) {
      original(nextAudio)
      return
    }
    // 过渡没结束又收到新的切歌请求：直接cut，保证 APlayer 的状态始终跟着用户走
    if (!isIdle()) {
      settle({ apply: false })
      original(nextAudio)
      return
    }
    const main = ap.audio
    const list = ap.list?.audios || []
    const index = nextAudio ? list.indexOf(nextAudio) : -1
    const canOverlap = crossfadeEnabled.value && !!nextAudio?.url && !!main &&
      !main.paused && list.length > 1 && index >= 0
    if (!canOverlap) {
      original(nextAudio)
      return
    }
    beginFade(ap, { mode: 'manual', pending: nextAudio, nextIndex: index, durationMs: MANUAL_FADE_SEC * 1000 })
  }
}

const interceptVolume = (ap) => {
  if (ap._mikuCrossfadeVolume) return
  const original = ap.volume.bind(ap)
  ap._mikuCrossfadeVolume = original
  ap.volume = (percentage, nostorage) => {
    const result = original(percentage, nostorage)
    if (Number.isFinite(parseFloat(percentage))) rememberVolume(ap.audio.volume)
    return result
  }
}

const restoreTrigger = (ap) => {
  if (!ap?._mikuCrossfadeTrigger) return
  ap.events.trigger = ap._mikuCrossfadeTrigger
  ap._mikuCrossfadeTrigger = null
}

const playIfPaused = (ap) => {
  if (!ap?.audio?.paused) return
  try {
    const started = ap.play()
    if (started && started.catch) started.catch(() => { })
  } catch (e) { }
}

const fadeMusicOut = (ap, durationInSec = 2, options = {}) => {
  if (!ap || ap.audio.paused) return
  settle({ apply: true })
  cancelDuck()
  stopPlayerFade()
  const startVolume = ap.audio.volume
  if (options.immediate || !shouldAnimate()) {
    setVolume(ap, 0)
    try { ap.pause() } catch (e) { }
    return
  }
  const total = Math.max(120, durationInSec * 1000)
  const startedAt = nowMs()
  playerFade = { timer: null }
  playerFade.timer = setInterval(() => {
    const progress = Math.min((nowMs() - startedAt) / total, 1)
    setVolume(ap, startVolume * (1 - progress))
    if (progress < 1) return
    stopPlayerFade()
    try { ap.pause() } catch (e) { }
  }, 50)
}

const fadeMusicIn = (ap, targetVol = null, durationInSec = 2, options = {}) => {
  if (!ap) return
  stopPlayerFade()
  const target = targetVol !== null ? clampVolume(targetVol) : userTargetVolume(ap)
  const remaining = ap.audio.duration - ap.audio.currentTime
  // 目标为 0 或临近结尾时不做淡入，避免和交叉淡化抢同一个音量
  if (options.immediate || !shouldAnimate() || target <= 0 || (Number.isFinite(remaining) && remaining <= END_FADE_SEC + 1)) {
    setVolume(ap, target)
    playIfPaused(ap)
    return
  }
  setVolume(ap, 0)
  playIfPaused(ap)
  const total = Math.max(120, durationInSec * 1000)
  const startedAt = nowMs()
  playerFade = { timer: null }
  playerFade.timer = setInterval(() => {
    if (!isIdle()) {
      stopPlayerFade()
      return
    }
    const progress = Math.min((nowMs() - startedAt) / total, 1)
    setVolume(ap, target * progress)
    if (progress >= 1) stopPlayerFade()
  }, 50)
}

const duckMusicForNotification = (notificationDuration = 3000) => {
  const ap = player
  if (!ap?.audio || ap.audio.paused) return
  if (isProgramControlling()) return
  const target = userTargetVolume(ap)
  if (target <= 0) return
  cancelDuck()
  const from = ap.audio.volume
  const to = target * DUCK_RATIO
  const startedAt = nowMs()
  duck = { timer: null, restore: null }
  duck.timer = setInterval(() => {
    if (!duck) return
    const progress = Math.min((nowMs() - startedAt) / DUCK_FADE_MS, 1)
    setVolume(ap, from + (to - from) * progress)
    if (progress < 1) return
    clearInterval(duck.timer)
    duck.timer = null
    duck.restore = setTimeout(() => {
      duck = null
      if (isProgramControlling()) return
      restoreVolume(ap)
    }, notificationDuration)
  }, 20)
}

const setupCrossfade = (ap, onSync) => {
  player = ap
  syncSession = typeof onSync === 'function' ? onSync : null
  interceptTrigger(ap)
  interceptSetAudio(ap)
  interceptVolume(ap)
  rememberVolume(ap.audio?.volume)
  userPaused = !!ap.audio?.paused
  ap.on('timeupdate', onTimeupdate)
  ap.on('pause', onPause)
  ap.on('play', onPlay)
  ap.on('listswitch', onListSwitch)
  if (!reconcileTimer) reconcileTimer = setInterval(reconcile, TICK_MS)
}

const cleanup = (ap, onSync) => {
  settle({ apply: false })
  dropPreload()
  stopPlayerFade()
  cancelDuck()
  pauseGuardUntil = 0
  if (reconcileTimer) {
    clearInterval(reconcileTimer)
    reconcileTimer = null
  }
  restoreTrigger(ap)
  if (ap) restoreVolume(ap)
  player = null
  syncSession = null
  if (typeof onSync === 'function') onSync()
}

const toggleCrossfade = (value) => {
  crossfadeEnabled.value = value !== false
  localStorage.setItem(STORAGE_KEY, String(crossfadeEnabled.value))
  if (crossfadeEnabled.value) return
  settle({ apply: true })
  dropPreload()
}

export const useCrossfade = () => {
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
