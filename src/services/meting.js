const METING_API = import.meta.env.VITE_METING_API
const DEFAULT_PLAYLIST_ID = '17543418420'
const DEFAULT_BITRATE = '2000'
import { songNameMap } from '../data/songNameMap.js'

export { DEFAULT_PLAYLIST_ID, DEFAULT_BITRATE }

export const BITRATE_OPTIONS = [
  { value: '2000', label: '高音质' },
  { value: '320', label: '标准音质' },
]

const buildPlaylistUrl = (apiBase, server, id, bitrate) => {
  let url = `${apiBase}?server=${encodeURIComponent(server)}&type=playlist&id=${encodeURIComponent(id)}`
  if (bitrate && bitrate !== '320') url += `&br=${encodeURIComponent(bitrate)}`
  return url
}

const mapSongName = (originalName, id) => {
  const cleanName = originalName.replace(/\s*-\s*STUDY WITH MIKU ver.\s*-\s*$/, '')
  return id === DEFAULT_PLAYLIST_ID && songNameMap[cleanName] ? songNameMap[cleanName] : originalName
}

const defuseHtml = (value) => String(value ?? '')
  .replace(/</g, '＜')
  .replace(/>/g, '＞')
  .replace(/"/g, '＂')

const normalizeSongs = (data, id) => data.map(song => {
  const originalName = song.title || song.name
  return {
    name: defuseHtml(mapSongName(originalName, id)),
    artist: defuseHtml(song.author || song.artist || ''),
    url: song.url,
    cover: song.pic || song.cover,
    lrc: song.lrc ? defuseHtml(song.lrc) : song.lrc
  }
})

export const fetchPlaylist = async (server = 'netease', id = DEFAULT_PLAYLIST_ID, bitrate = DEFAULT_BITRATE) => {
  try {
    const response = await fetch(buildPlaylistUrl(METING_API, server, id, bitrate))
    if (!response.ok) return []
    const data = await response.json()
    if (!Array.isArray(data) || data.length === 0) return []
    return normalizeSongs(data, id)
  } catch (error) {
    console.error(`Meting API 错误:`, error)
    return []
  }
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
export const PLAYLIST_NAME_API = String(import.meta.env.VITE_WS_URL || '')
  .replace(/^ws/, 'http')
  .replace(/\/ws\/?$/, '')

const getPlaylistNameUrl = (platform, id) => {
  if (!PLAYLIST_NAME_API || !platform || !id) return ''
  return `${PLAYLIST_NAME_API}/playlist-name?platform=${encodeURIComponent(platform)}&id=${encodeURIComponent(id)}`
}

export const fetchPlaylistName = async (platform, id) => {
  const url = getPlaylistNameUrl(platform, id)
  if (!url) return ''
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(4000) })
    if (!response.ok) return ''
    const data = await response.json()
    return typeof data?.name === 'string' ? data.name.trim() : ''
  } catch {
    return ''
  }
}
