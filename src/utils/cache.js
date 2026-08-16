const cache = {
  videos: new Map(),
  audios: new Map()
}

export const getVideo = (src) => {
  return new Promise((resolve, reject) => {
    if (cache.videos.has(src)) {
      resolve(cache.videos.get(src))
      return
    }

    const video = document.createElement('video')
    video.src = src
    video.preload = 'auto'
    video.onloadeddata = () => {
      cache.videos.set(src, video)
      resolve(video)
    }
    video.onerror = reject
  })
}

export const getAudio = (src) => {
  return new Promise((resolve, reject) => {
    if (cache.audios.has(src)) {
      resolve(cache.audios.get(src))
      return
    }

    const audio = document.createElement('audio')
    audio.src = src
    audio.preload = 'auto'
    audio.onloadeddata = () => {
      cache.audios.set(src, audio)
      resolve(audio)
    }
    audio.onerror = reject
  })
}
export const preloadVideos = (urls) => {
  return Promise.all(urls.map(url => getVideo(url)))
}
export const preloadAudios = (urls) => {
  return Promise.all(urls.map(url => getAudio(url)))
}
export const clearCache = (type) => {
  if (cache[type]) {
    if (type === 'videos' || type === 'audios') {
      cache[type].forEach((media) => {
        if (media && typeof media.remove === 'function') {
          media.remove()
        }
      })
      cache[type].clear()
    } else {
      cache[type].clear()
    }
  }
}
export const clearAllCache = () => {
  Object.keys(cache).forEach(type => clearCache(type))
}
