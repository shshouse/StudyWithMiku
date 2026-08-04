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

const normalizeSongs = (data, id) => data.map(song => {
  const originalName = song.title || song.name
  return {
    name: mapSongName(originalName, id),
    artist: song.author || song.artist,
    url: song.url,
    cover: song.pic || song.cover,
    lrc: song.lrc
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
