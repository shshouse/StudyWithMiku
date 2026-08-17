const STORAGE_KEY = 'study_with_miku_settings'

const defaultSettings = {
  pomodoro: {
    focusDuration: 25,
    breakDuration: 5,
    pauseMusicDuringBreak: true,
    hidePomodoroOnIdle: false,
    showHitokoto: true,
    pomodoroCount: 4,
    timerMode: 'pomodoro',
    notificationVolume: 0.6,
  },
  video: {
    currentIndex: 0,
    overlayOpacity: 0.3,
  },
  music: {
    currentSongIndex: 0
  }
}

export const getSettings = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      return { ...defaultSettings, ...JSON.parse(stored) }
    }
  } catch (e) {
    console.error('Failed to load settings:', e)
  }
  return { ...defaultSettings }
}

export const saveSettings = (settings) => {
  try {
    const current = getSettings()
    const merged = { ...current, ...settings }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
  } catch (e) {
    console.error('Failed to save settings:', e)
  }
}

const clampInt = (value, fallback, min, max) => {
  const v = Math.floor(Number(value))
  if (!Number.isFinite(v)) return fallback
  return Math.min(Math.max(v, min), max)
}

export const savePomodoroSettings = (focusDuration, breakDuration, pauseMusicDuringBreak, hidePomodoroOnIdle, showHitokoto) => {
  const settings = getSettings()
  settings.pomodoro = {
    ...settings.pomodoro,
    focusDuration: clampInt(focusDuration, 25, 1, 100),
    breakDuration: clampInt(breakDuration, 5, 1, 100),
    pauseMusicDuringBreak,
    hidePomodoroOnIdle,
    showHitokoto,
  }
  saveSettings(settings)
}

export const getPomodoroSettings = () => {
  return getSettings().pomodoro
}

export const getDefaultPomodoroSettings = () => {
  return { ...defaultSettings.pomodoro }
}

export const saveMusicPauseSettings = (pauseMusicDuringBreak, hidePomodoroOnIdle, showHitokoto) => {
  const settings = getSettings()
  settings.pomodoro.pauseMusicDuringBreak = pauseMusicDuringBreak
  settings.pomodoro.hidePomodoroOnIdle = hidePomodoroOnIdle
  settings.pomodoro.showHitokoto = showHitokoto
  saveSettings(settings)
}

export const saveTimerSettings = (timerMode, pomodoroCount) => {
  const settings = getSettings()
  settings.pomodoro.timerMode = timerMode
  settings.pomodoro.pomodoroCount = clampInt(pomodoroCount, 4, 1, 20)
  saveSettings(settings)
}

export const saveNotificationVolume = (volume) => {
  const settings = getSettings()
  settings.pomodoro.notificationVolume = Math.max(0, Math.min(1, Number(volume) || 0))
  saveSettings(settings)
}

export const saveVideoIndex = (index) => {
  const settings = getSettings()
  settings.video = { ...settings.video, currentIndex: index }
  saveSettings(settings)
}

export const getVideoIndex = () => {
  return getSettings().video.currentIndex
}

export const getOverlayOpacity = () => {
  return getSettings().video.overlayOpacity
}

export const saveOverlayOpacity = (opacity) => {
  const settings = getSettings()
  settings.video.overlayOpacity = Math.max(0, Math.min(1, Number(opacity) || 0))
  saveSettings(settings)
}

export const saveMusicIndex = (index) => {
  const settings = getSettings()
  settings.music = { currentSongIndex: index }
  saveSettings(settings)
}

export const getMusicIndex = () => {
  return getSettings().music.currentSongIndex
}
