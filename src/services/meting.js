const METING_API = import.meta.env.VITE_METING_API
const METING_API_FALLBACK = import.meta.env.VITE_METING_API_FALLBACK
const DEFAULT_PLAYLIST_ID = '17543418420'
const DEFAULT_BITRATE = '2000'
import { songNameMap } from '../data/songNameMap.js'

export { DEFAULT_PLAYLIST_ID, DEFAULT_BITRATE }

export const BITRATE_OPTIONS = [
  { value: '2000', label: '高音质' },
  { value: '320', label: '标准音质' },
]

const buildPlaylistUrl = (apiBase, server, id, bitrate) => {
  let url = `${apiBase}?server=${server}&type=playlist&id=${id}`
  if (bitrate && bitrate !== '320') url += `&br=${bitrate}`
  return url
}

const normalizeSongs = (data, id) => data.map(song => {
  const originalName = song.title || song.name
  const cleanName = originalName.replace(/\s*-\s*STUDY WITH MIKU ver.\s*-\s*$/, '')
  const name = id === DEFAULT_PLAYLIST_ID && songNameMap[cleanName] ? songNameMap[cleanName] : originalName
  return {
    name,
    artist: song.author || song.artist,
    url: song.url,
    cover: song.pic || song.cover,
    lrc: song.lrc
  }
})

const tryFetch = async (apiBase, server, id, bitrate) => {
  try {
    const response = await fetch(buildPlaylistUrl(apiBase, server, id, bitrate))
    if (!response.ok) return null
    const data = await response.json()
    if (!Array.isArray(data) || data.length === 0) return null
    return normalizeSongs(data, id)
  } catch (error) {
    console.error(`Meting API(${apiBase})错误:`, error)
    return null
  }
}

const probeFirstSong = async (songs, timeoutMs = 3000) => {
  if (!songs || !songs.length) return false
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    const res = await fetch(songs[0].url, { signal: ctrl.signal })
    clearTimeout(timer)
    ctrl.abort()
    if (!res.ok) return false
    const ct = res.headers.get('content-type') || ''
    return !ct.includes('text/html')
  } catch {
    return false
  }
}

export const fetchPlaylist = async (server = 'netease', id = DEFAULT_PLAYLIST_ID, bitrate = DEFAULT_BITRATE) => {
  const primary = await tryFetch(METING_API, server, id, bitrate)
  if (primary && await probeFirstSong(primary)) return primary

  if (METING_API_FALLBACK && METING_API_FALLBACK !== METING_API) {
    console.warn('回退中┭┮﹏┭┮', METING_API_FALLBACK)
    const fallback = await tryFetch(METING_API_FALLBACK, server, id, bitrate)
    if (fallback && await probeFirstSong(fallback)) return fallback
    if (fallback) return fallback
  }
  return primary || []
}

export const getStoredConfig = () => {
  return {
    platform: localStorage.getItem('music_platform') || 'netease',
    id: DEFAULT_PLAYLIST_ID
  }
}

export const saveConfig = (platform, id) => {
  localStorage.setItem('music_platform', platform)
  localStorage.setItem('music_id', id)
}
