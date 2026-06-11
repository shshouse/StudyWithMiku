const METING_API = import.meta.env.VITE_METING_API
const DEFAULT_PLAYLIST_ID = '17543418420'
const DEFAULT_BITRATE = '2000'
import { songNameMap } from '../data/songNameMap.js'

export { DEFAULT_PLAYLIST_ID, DEFAULT_BITRATE }

export const BITRATE_OPTIONS = [
  { value: '2000', label: '高音质' },
  { value: '320', label: '标准音质' },
]

export const fetchPlaylist = async (server = 'netease', id = DEFAULT_PLAYLIST_ID, bitrate = DEFAULT_BITRATE) => {
  let url = `${METING_API}?server=${server}&type=playlist&id=${id}`
  if (bitrate && bitrate !== '320') {
    url += `&br=${bitrate}`
  }
  
  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error('网络错误/(ㄒoㄒ)/~~')
    
    const data = await response.json()
    
    return data.map(song => {
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
  } catch (error) {
    console.error('Meting API错误:', error)
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
