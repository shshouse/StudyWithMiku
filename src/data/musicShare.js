const PREFIX = '[music:'
const SUFFIX = ']'

export const buildMusicShareMessage = ({ platform, playlistId, songIndex, name, playlistName }) => {
  const payload = {
    p: platform,
    pid: playlistId,
    i: songIndex,
    n: name,
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
      playlistName: String(d.pn || ''),
    }
  } catch {
    return null
  }
}
