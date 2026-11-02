import { ref } from 'vue'

const isHoveringUI = ref(false)
let aplayerInstance = null

export const setAPlayerInstance = (instance) => {
  aplayerInstance = instance
}

export const getAPlayerInstance = () => aplayerInstance

export const setHoveringUI = (value) => {
  isHoveringUI.value = value
}

export const getHoveringUI = () => isHoveringUI

export { isHoveringUI }
