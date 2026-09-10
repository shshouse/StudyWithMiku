export const STICKER_BASE_URL = '/sticker'
export const STICKER_FILES = {
  1: 'webp',
  2: 'webp',
  3: 'webp',
  4: 'jpg',
  5: 'webp',
  6: 'webp',
  7: 'webp',
  8: 'webp',
  9: 'webp',
  10: 'webp',
  11: 'jpg',
  12: 'gif',
  13: 'jpg',
  14: 'jpg',
  15: 'gif',
  16: 'png',
}

export const RETIRED_STICKER_IDS = [10]
export const STICKER_IDS = Object.keys(STICKER_FILES).map(Number)
  .filter(id => !RETIRED_STICKER_IDS.includes(id))
  .sort((a, b) => a - b)
export const STICKER_PATTERN = /^\[sticker:(\d+)\]$/
export const getStickerId = (content) => {
  if (typeof content !== 'string') return null
  const match = content.match(STICKER_PATTERN)
  const id = Number(match?.[1])
  return STICKER_FILES[id] ? id : null
}
export const buildStickerMessage = (id) => {
  const num = Number(id)
  if (!STICKER_IDS.includes(num)) return ''
  return `[sticker:${num}]`
}
export const getStickerUrl = (id) => {
  const num = Number(id)
  if (!STICKER_FILES[num]) return ''
  return `${STICKER_BASE_URL}/${num}.${STICKER_FILES[num]}`
}
