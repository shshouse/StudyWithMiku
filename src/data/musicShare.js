const PREFIX = '[music:'
const SUFFIX = ']'
const ALLOWED_PLATFORMS = new Set(['netease', 'tencent'])
const ALLOWED_COVER_DOMAINS = new Set([
  'p1.music.126.net', 'p2.music.126.net', 'p3.music.126.net', 'p4.music.126.net',
  'y.gtimg.cn', 'imgcache.qq.com',
])

export const extractPicId = (coverUrl) => {
  if (!coverUrl) return ''
  const match = String(coverUrl).match(/[?&]id=([^&]+)/)
  return match ? match[1] : ''
}
export const buildPicUrl = (apiBase, platform, cover) => {
  if (!cover) return ''
  if (cover.startsWith('/')) return cover
  if (cover.startsWith('http')) {
    try {
      return ALLOWED_COVER_DOMAINS.has(new URL(cover).hostname) ? cover : ''
    } catch {
      return ''
    }
  }
  if (!ALLOWED_PLATFORMS.has(platform)) return ''
  return `${apiBase}?server=${encodeURIComponent(platform)}&type=pic&id=${encodeURIComponent(cover)}`
}

export const buildMusicShareMessage = ({ platform, playlistId, songIndex, name, cover, playlistName }) => {
  const payload = {
    p: platform,
    pid: playlistId,
    i: songIndex,
    n: name,
    c: extractPicId(cover) || cover,
    pn: playlistName,
  }
  return `${PREFIX}${JSON.stringify(payload)}${SUFFIX}`
}

export const parseMusicShareMessage = (content) => {
  if (typeof content !== 'string' || !content.startsWith(PREFIX)) return null
  const end = content.lastIndexOf(SUFFIX)
  if (end < PREFIX.length) return null
  try {
    const d = JSON.parse(content.slice(PREFIX.length, end))
    if (!d || !ALLOWED_PLATFORMS.has(d.p) || !d.pid || !Number.isFinite(d.i)) return null
    return {
      platform: d.p,
      playlistId: String(d.pid),
      songIndex: Number(d.i),
      name: String(d.n || ''),
      cover: String(d.c || ''),
      playlistName: String(d.pn || ''),
    }
  } catch {
    return null
  }
}

const COUNTDOWN_PREFIX = '[countdown:'
const COUNTDOWN_SUFFIX = ']'
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export const buildCountdownShareMessage = ({ title, date }) => {
  if (!title || !DATE_PATTERN.test(String(date))) return ''
  return `${COUNTDOWN_PREFIX}${JSON.stringify({ t: String(title).slice(0, 40), d: date })}${COUNTDOWN_SUFFIX}`
}

export const parseCountdownShareMessage = (content) => {
  if (typeof content !== 'string' || !content.startsWith(COUNTDOWN_PREFIX)) return null
  const end = content.lastIndexOf(COUNTDOWN_SUFFIX)
  if (end < COUNTDOWN_PREFIX.length) return null
  try {
    const d = JSON.parse(content.slice(COUNTDOWN_PREFIX.length, end))
    if (!d || typeof d.t !== 'string' || !d.t || typeof d.d !== 'string' || !DATE_PATTERN.test(d.d)) return null
    return { title: d.t, date: d.d }
  } catch {
    return null
  }
}
