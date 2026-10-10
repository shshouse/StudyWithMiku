const REPLY_PATTERN = /^\[reply:([^\]]+)\]/

export const buildReplyMessage = (replyToId, text) => {
  const id = String(replyToId || '').trim()
  const content = String(text || '').trim()
  if (!id || !content) return ''
  return `[reply:${id}]${content}`
}

export const parseReplyMessage = (content) => {
  const str = String(content || '')
  const match = REPLY_PATTERN.exec(str)
  if (!match) return null
  return {
    replyToId: match[1],
    text: str.slice(match[0].length),
  }
}
