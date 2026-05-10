import { ref } from 'vue'

const musicVolume = ref(0.7)
const originalVolume = ref(0.7)
const isHoveringUI = ref(false)
let aplayerInstance = null

export const setAPlayerInstance = (instance) => {
  aplayerInstance = instance
}

export const getAPlayerInstance = () => aplayerInstance

export const fadeVolume = (targetVolume, duration = 500) => {
  return new Promise((resolve) => {
    if (!aplayerInstance) {
      resolve()
      return
    }
    
    const startVolume = aplayerInstance.audio.volume
    const volumeDiff = targetVolume - startVolume
    const steps = 20
    const stepDuration = duration / steps
    let currentStep = 0
    
    const interval = setInterval(() => {
      currentStep++
      const progress = currentStep / steps
      const easeProgress = 1 - Math.pow(1 - progress, 3)
      const newVolume = startVolume + volumeDiff * easeProgress
      aplayerInstance.audio.volume = Math.max(0, Math.min(1, newVolume))
      
      if (currentStep >= steps) {
        clearInterval(interval)
        aplayerInstance.audio.volume = targetVolume
        resolve()
      }
    }, stepDuration)
  })
}

export const duckMusicForNotification = async (notificationDuration = 3000) => {
  if (!aplayerInstance) return
  if (aplayerInstance.audio.volume <= 0) return

  originalVolume.value = aplayerInstance.audio.volume
  const duckedVolume = originalVolume.value * 0.2
  
  await fadeVolume(duckedVolume, 300)
  
  setTimeout(async () => {
    await fadeVolume(originalVolume.value, 300)
  }, notificationDuration)
}

export const setHoveringUI = (value) => {
  isHoveringUI.value = value
}

export const getHoveringUI = () => isHoveringUI

export { musicVolume, originalVolume, isHoveringUI }
