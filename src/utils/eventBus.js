import { ref } from 'vue'

const musicVolume = ref(0.7)
const originalVolume = ref(0.7)
const isHoveringUI = ref(false)
let aplayerInstance = null

export const setAPlayerInstance = (instance) => {
  aplayerInstance = instance
}

export const getAPlayerInstance = () => aplayerInstance

const suppressVolumeSave = (duration = 500) => {
  if (!aplayerInstance) return
  aplayerInstance._mikuSuppressVolumeSaveUntil = Math.max(
    aplayerInstance._mikuSuppressVolumeSaveUntil || 0,
    Date.now() + duration
  )
}

const getAudio = () => {
  const ap = aplayerInstance
  if (!ap || !ap.audio) return null
  return ap.audio
}

export const fadeVolume = (targetVolume, duration = 500) => {
  return new Promise((resolve) => {
    const audio = getAudio()
    if (!audio) {
      resolve()
      return
    }

    suppressVolumeSave(duration + 200)
    const startVolume = audio.volume
    const volumeDiff = targetVolume - startVolume
    const steps = 20
    const stepDuration = duration / steps
    let currentStep = 0

    const interval = setInterval(() => {
      const current = getAudio()
      if (!current) {
        clearInterval(interval)
        resolve()
        return
      }
      currentStep++
      const progress = currentStep / steps
      const easeProgress = 1 - Math.pow(1 - progress, 3)
      const newVolume = startVolume + volumeDiff * easeProgress
      current.volume = Math.max(0, Math.min(1, newVolume))

      if (currentStep >= steps) {
        clearInterval(interval)
        current.volume = targetVolume
        resolve()
      }
    }, stepDuration)
  })
}

let duckRestoreTimer = null

export const duckMusicForNotification = async (notificationDuration = 3000) => {
  const audio = getAudio()
  if (!audio) return
  if (audio.volume <= 0) return
  if (audio.paused) return

  if (duckRestoreTimer) {
    clearTimeout(duckRestoreTimer)
    duckRestoreTimer = null
  }

  originalVolume.value = audio.volume
  const duckedVolume = originalVolume.value * 0.2

  await fadeVolume(duckedVolume, 300)

  const afterDuck = getAudio()
  if (!afterDuck || afterDuck.paused) return

  duckRestoreTimer = setTimeout(async () => {
    duckRestoreTimer = null
    const restoreAudio = getAudio()
    if (!restoreAudio || restoreAudio.paused) return
    await fadeVolume(originalVolume.value, 300)
  }, notificationDuration)
}

export const cancelDuck = () => {
  if (duckRestoreTimer) {
    clearTimeout(duckRestoreTimer)
    duckRestoreTimer = null
  }
}

export const setHoveringUI = (value) => {
  isHoveringUI.value = value
}

export const getHoveringUI = () => isHoveringUI

export { musicVolume, originalVolume, isHoveringUI }