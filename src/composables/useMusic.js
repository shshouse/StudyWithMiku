import { ref } from 'vue'
import { fetchPlaylist, getStoredConfig, saveConfig, DEFAULT_PLAYLIST_ID, DEFAULT_BITRATE, BITRATE_OPTIONS } from '../services/meting.js'
import { localSongsData } from '../data/localSongs.js'

const songs = ref([])
const loading = ref(false)
const metingConfig = ref(getStoredConfig())
const playlistId = ref(localStorage.getItem('playlist_id') || DEFAULT_PLAYLIST_ID)
const platform = ref(localStorage.getItem('music_platform') || 'netease')
const bitrate = ref(localStorage.getItem('music_bitrate') || DEFAULT_BITRATE)

// Only the most recently requested playlist may update shared music state.
let loadRequestId = 0

const PLATFORMS = [
  { value: 'netease', label: '网易云' },
  { value: 'tencent', label: 'QQ音乐' },
]

const CUSTOM_KEY = 'custom_playlists'
const isValidPlatform = (p) => PLATFORMS.some(x => x.value === p)

const loadCustomPlaylists = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter(p => p && isValidPlatform(p.platform) && String(p.playlistId || '').trim())
  } catch {
    return []
  }
}

const customPlaylists = ref(loadCustomPlaylists())

const persistCustom = (list) => {
  customPlaylists.value = list
  try {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(list))
  } catch (e) {
    console.error('Failed to save custom playlists:', e)
  }
}

const addCustomPlaylist = (p, id, name) => {
  if (!isValidPlatform(p)) return false
  const playlistId = String(id || '').trim()
  if (!playlistId) return false
  const existing = customPlaylists.value.find(x => x.platform === p && x.playlistId === playlistId)
  const title = String(name || '').trim().slice(0, 50) || existing?.name || `ID:${playlistId}`
  const rest = customPlaylists.value.filter(x => !(x.platform === p && x.playlistId === playlistId))
  persistCustom([{ name: title, platform: p, playlistId }, ...rest])
  return true
}

const removeCustomPlaylist = (p, id) => {
  persistCustom(customPlaylists.value.filter(x => !(x.platform === p && x.playlistId === id)))
}

export const useMusic = () => {

  const loadMetingSongs = async (platform, id) => {
    const requestId = ++loadRequestId
    loading.value = true

    try {
      let playlist
      if (platform === 'local') {
        playlist = localSongsData[id] || []
      } else {
        playlist = await fetchPlaylist(platform, id, bitrate.value)

        if (id === '8894040639' && platform === 'netease') {
          const specialMusicSongs = localSongsData.special_music || []
          playlist = [...playlist, ...specialMusicSongs]
        }
      }

      // A newer selection was made while this request was in flight.
      if (requestId !== loadRequestId) return false

      if (playlist.length > 0) {
        songs.value = playlist
        saveConfig(platform, id)
        metingConfig.value = { platform, id }
        return true
      }
    } catch (error) {
      if (requestId === loadRequestId) {
        console.error('Load meting songs error:', error)
      }
    } finally {
      // An older request must not clear the loading indicator for a newer one.
      if (requestId === loadRequestId) {
        loading.value = false
      }
    }
    return false
  }

  const loadSongs = async () => {
    await loadMetingSongs(metingConfig.value.platform, playlistId.value)
  }

  const updateMetingPlaylist = async (platform, id) => {
    await loadMetingSongs(platform, id)
  }

  const setPlaylistId = (id) => {
    playlistId.value = id
    localStorage.setItem('playlist_id', id)
  }

  const resetPlaylistId = () => {
    playlistId.value = DEFAULT_PLAYLIST_ID
    localStorage.setItem('playlist_id', DEFAULT_PLAYLIST_ID)
  }

  const setPlatform = (p) => {
    platform.value = p
    localStorage.setItem('music_platform', p)
  }

  const setBitrate = (br) => {
    bitrate.value = br
    localStorage.setItem('music_bitrate', br)
    return loadMetingSongs(platform.value, playlistId.value)
  }

  const applyCustomPlaylist = async (p, id) => {
    const ok = await loadMetingSongs(p, id)
    if (!ok) return false
    setPlatform(p)
    setPlaylistId(id)
    return true
  }

  const resetToLocal = async () => {
    setPlatform('netease')
    resetPlaylistId()
    await loadMetingSongs('netease', DEFAULT_PLAYLIST_ID)
  }

  return {
    songs,
    loading,
    metingConfig,
    playlistId,
    platform,
    bitrate,
    customPlaylists,
    addCustomPlaylist,
    removeCustomPlaylist,
    loadSongs,
    updateMetingPlaylist,
    setPlaylistId,
    resetPlaylistId,
    setPlatform,
    setBitrate,
    applyCustomPlaylist,
    resetToLocal,
    DEFAULT_PLAYLIST_ID,
    PLATFORMS,
    BITRATE_OPTIONS
  }
}
