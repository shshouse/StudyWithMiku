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

const extractUrlParts = (url) => {
  try {
    const u = new URL(url)
    return {
      id: u.searchParams.get('id'),
      server: u.searchParams.get('server') || 'netease'
    }
  } catch {
    return null
  }
}

const buildPrimaryUrl = (fallbackUrl) => {
  const parts = extractUrlParts(fallbackUrl)
  if (!parts?.id) return fallbackUrl
  return `${METING_API}?server=${parts.server}&type=url&id=${parts.id}`
}

const mapSongName = (originalName, id) => {
  const cleanName = originalName.replace(/\s*-\s*STUDY WITH MIKU ver.\s*-\s*$/, '')
  return id === DEFAULT_PLAYLIST_ID && songNameMap[cleanName] ? songNameMap[cleanName] : originalName
}

const normalizeSongs = (data, id, useFallbackUrl = false) => data.map(song => {
  const originalName = song.title || song.name
  const fallbackUrl = song.url
  return {
    name: mapSongName(originalName, id),
    artist: song.author || song.artist,
    url: useFallbackUrl ? fallbackUrl : buildPrimaryUrl(fallbackUrl),
    _fallbackUrl: useFallbackUrl ? null : fallbackUrl,
    cover: song.pic || song.cover,
    lrc: song.lrc
  }
})

export const fetchPlaylist = async (server = 'netease', id = DEFAULT_PLAYLIST_ID, bitrate = DEFAULT_BITRATE) => {
  if (METING_API_FALLBACK) {
    try {
      const response = await fetch(buildPlaylistUrl(METING_API_FALLBACK, server, id, bitrate))
      if (response.ok) {
        const data = await response.json()
        if (Array.isArray(data) && data.length > 0) return normalizeSongs(data, id)
      }
    } catch (error) {
      console.error(`备用API错误:`, error)
    }
  }

  try {
    const response = await fetch(buildPlaylistUrl(METING_API, server, id, bitrate))
    if (!response.ok) return []
    const data = await response.json()
    if (!Array.isArray(data) || data.length === 0) return []
    return normalizeSongs(data, id, true)
  } catch (error) {
    console.error(`Meting 主 API错误:`, error)
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
