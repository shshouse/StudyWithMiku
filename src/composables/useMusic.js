import { ref } from 'vue'
import { fetchPlaylist, getStoredConfig, saveConfig, DEFAULT_PLAYLIST_ID } from '../services/meting.js'

const songs = ref([])
const loading = ref(false)
const metingConfig = ref(getStoredConfig())
const playlistId = ref(localStorage.getItem('playlist_id') || DEFAULT_PLAYLIST_ID)
const platform = ref(localStorage.getItem('music_platform') || 'netease')

const PLATFORMS = [
  { value: 'netease', label: '网易云' },
  { value: 'tencent', label: 'QQ音乐' }
]

export const useMusic = () => {
  const loadMetingSongs = async (platform, id) => {
    loading.value = true
    try {
      const playlist = await fetchPlaylist(platform, id)
      if (playlist.length > 0) {
        songs.value = playlist
        saveConfig(platform, id)
        metingConfig.value = { platform, id }
      }
    } catch (error) {
      console.error('Load meting songs error:', error)
    } finally {
      loading.value = false
    }
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

  const applyCustomPlaylist = async (p, id) => {
    setPlatform(p)
    setPlaylistId(id)
    await loadMetingSongs(p, id)
  }

  const resetToDefault = async () => {
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
    loadSongs,
    updateMetingPlaylist,
    setPlaylistId,
    resetPlaylistId,
    setPlatform,
    applyCustomPlaylist,
    resetToDefault,
    DEFAULT_PLAYLIST_ID,
    PLATFORMS
  }
}
