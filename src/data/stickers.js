// 表情包配置
// 占位符格式: [sticker:N]，N 为 1-10
// 资源位于 /public/sticker/{N}.{webp|jpg}
export const STICKER_BASE_URL = '/sticker'

// 表情包扩展名映射（处理混合 webp/jpg 格式）
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
}

// 合法表情包 ID 集合
export const STICKER_IDS = Object.keys(STICKER_FILES).map(Number).sort((a, b) => a - b)

// 消息内容占位符正则
export const STICKER_PATTERN = /^\[sticker:([1-9]|10)\]$/

// 从消息内容提取表情包 ID，返回 null 表示非表情包
export const getStickerId = (content) => {
  if (typeof content !== 'string') return null
  const match = content.match(STICKER_PATTERN)
  return match ? Number(match[1]) : null
}

// 构造表情包消息内容
export const buildStickerMessage = (id) => {
  if (!STICKER_FILES[id]) return ''
  return `[sticker:${id}]`
}

// 获取表情包 URL
export const getStickerUrl = (id) => {
  if (!STICKER_FILES[id]) return ''
  return `${STICKER_BASE_URL}/${id}.${STICKER_FILES[id]}`
}
