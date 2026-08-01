const PREFIX = '[music:'
const SUFFIX = ']'
export const extractPicId = (coverUrl) => {
  if (!coverUrl) return ''
  const match = String(coverUrl).match(/[?&]id=([^&]+)/)
  return match ? match[1] : ''
}
export const buildPicUrl = (apiBase, platform, cover) => {
  if (!cover) return ''
  if (cover.startsWith('http') || cover.startsWith('/')) return cover
  return `${apiBase}?server=${platform}&type=pic&id=${cover}`
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
    if (!d || !d.p || !d.pid || !Number.isFinite(d.i)) return null
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
