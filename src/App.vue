<template>
  <div class="app-container" @mousemove="onMouseMove" @mouseleave="onMouseLeave">
    <transition name="fade" mode="out-in">
      <video 
        :key="currentVideo"
        ref="videoRef" 
        class="video-background" 
        :src="currentVideo" 
        autoplay 
        muted 
        loop
        playsinline
        webkit-playsinline
        preload="auto"
        @loadeddata="onVideoLoaded"
        @error="onVideoError"
        @stalled="onVideoStalled"
      ></video>
    </transition>
    <div class="overlay"></div>
    <div class="content" :class="{ hidden: !showControls }">
      <h1 class="title">Study With Miku</h1>
      <p class="subtitle">yeeeeeee~~~~~~</p>
    </div>
    <button class="switch-video-btn" @click="switchVideo" :class="{ hidden: !showControls }" @mouseenter="onUIMouseEnter" @mouseleave="onUIMouseLeave" @touchstart="onUITouchStart" @touchend="onUITouchEnd">
      切换
    </button>
    
    <button class="fullscreen-btn" @click="toggleFullscreen" :class="{ hidden: !showControls }" @mouseenter="onUIMouseEnter" @mouseleave="onUIMouseLeave" @touchstart="onUITouchStart" @touchend="onUITouchEnd">
      {{ isFullscreen ? '退出全屏' : '全屏' }}
    </button>
    
    <!-- 番茄钟！＞﹏＜ -->
    <PomodoroTimer :showControls="showControls" />
    
    <!-- 入站公告弹窗 -->
    <AnnouncementModal />
    
    <!-- APlayer 播放器 -->
    <div id="aplayer" class="aplayer-container"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useFullscreen } from '@vueuse/core'
import { loadScript, loadStyle, preloadVideos } from './utils/cache.js'
import { setAPlayerInstance, setHoveringUI, isHoveringUI } from './utils/eventBus.js'
import { useMusic } from './composables/useMusic.js'
import { getVideoIndex, saveVideoIndex, getMusicIndex, saveMusicIndex } from './utils/userSettings.js'
import PomodoroTimer from './components/PomodoroTimer.vue'
import AnnouncementModal from './components/AnnouncementModal.vue'

const { isFullscreen, toggle: useFullscreenToggle } = useFullscreen()

const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)

const toggleFullscreen = async () => {
  await useFullscreenToggle()
  
  if (isMobile) {
    if (isFullscreen.value) {
      try {
        await screen.orientation.lock('landscape')
      } catch (e) {
        console.log('无法锁定屏幕方向:', e)
      }
    } else {
      screen.orientation.unlock()
    }
  }
}
const showControls = ref(true)
const inactivityTimer = ref(null)

const startHideTimer = () => {
  if (inactivityTimer.value) {
    clearTimeout(inactivityTimer.value)
  }
  inactivityTimer.value = setTimeout(() => {
    if (!isHoveringUI.value) {
      showControls.value = false
      document.body.style.cursor = 'none'
    }
  }, 3000)
}

const onMouseMove = () => {
  showControls.value = true
  document.body.style.cursor = 'default'
  startHideTimer()
}

const onMouseLeave = () => {
  if (!isHoveringUI.value) {
    showControls.value = false
    document.body.style.cursor = 'none'
  }
}

const onUIMouseEnter = () => {
  isHoveringUI.value = true
  if (inactivityTimer.value) {
    clearTimeout(inactivityTimer.value)
  }
}

const onUIMouseLeave = () => {
  isHoveringUI.value = false
  startHideTimer()
}

const onUITouchStart = () => {
  isHoveringUI.value = true
  if (inactivityTimer.value) {
    clearTimeout(inactivityTimer.value)
  }
}

const onUITouchEnd = () => {
  isHoveringUI.value = false
  startHideTimer()
}

const videoRef = ref(null)

const isR2Domain = window.location.hostname === 'study.mikugame.icu'
const R2_BASE_URL = 'https://studycdn.mikugame.icu/mp4'

const video2Name = isMobile ? '2_H264.mp4' : '2.mp4'

const videos = isR2Domain
  ? [
      `${R2_BASE_URL}/1.mp4`,
      `${R2_BASE_URL}/${video2Name}`,
      `${R2_BASE_URL}/3.mp4`
    ]
  : [
      '/1.mp4',
      `/${video2Name}`,
      '/3.mp4',
      '/4.mp4'
    ]

const savedVideoIndex = getVideoIndex()
const currentVideoIndex = ref(savedVideoIndex < videos.length ? savedVideoIndex : 0)
const currentVideo = ref(videos[currentVideoIndex.value])

const switchVideo = () => {
  currentVideoIndex.value = (currentVideoIndex.value + 1) % videos.length
  currentVideo.value = videos[currentVideoIndex.value]
  saveVideoIndex(currentVideoIndex.value)
}

const aplayer = ref(null)
const aplayerInitialized = ref(false)
const { songs, loadSongs, loading } = useMusic()

let videoStalledTimer = null
const onVideoLoaded = () => {
  if (videoStalledTimer) { clearTimeout(videoStalledTimer); videoStalledTimer = null }
  const video = videoRef.value
  if (video) {
    video.play().catch(() => {})
    videoStalledTimer = setTimeout(() => {
      if (video && video.currentTime < 0.5) {
        console.warn('视频播放异常，自动切换')
        switchVideo()
      }
    }, 3000)
  }
}
const onVideoError = () => {
  console.error('视频加载失败，切换到下一个')
  switchVideo()
}
const onVideoStalled = () => {
  const video = videoRef.value
  if (video && video.currentTime < 0.5) {
    console.warn('视频卡住，尝试切换')
    setTimeout(() => {
      if (video && video.currentTime < 0.5) switchVideo()
    }, 5000)
  }
}

// 监听显示/隐藏状态变化
watch(showControls, (newValue) => {
  if (aplayer.value && aplayerInitialized.value) {
    const playerElement = document.getElementById('aplayer')
    if (playerElement) {
      if (newValue) {
        playerElement.classList.remove('lrc-only')
        playerElement.style.pointerEvents = 'auto'
      } else {
        playerElement.classList.add('lrc-only')
        playerElement.style.pointerEvents = 'none'
      }
    }
  }
})

const reportVisit = () => {
  fetch('/api/visit', { method: 'POST' }).catch(() => {})
}

const load51LaAnalytics = () => {
  if (document.getElementById('LA_COLLECT')) return
  const script = document.createElement('script')
  script.charset = 'UTF-8'
  script.id = 'LA_COLLECT'
  script.src = '//sdk.51.la/js-sdk-pro.min.js'
  script.onload = () => {
    if (window.LA) {
      window.LA.init({id:"3OFbo4ER8B3QNm7x",ck:"3OFbo4ER8B3QNm7x",autoTrack:true,hashMode:true})
    }
  }
  document.head.appendChild(script)
}

onMounted(() => {
  load51LaAnalytics()
  reportVisit()
  const preloadAllVideos = async () => {
    try {
      await preloadVideos(videos)
      console.log('所有视频预加载完成')
    } catch (error) {
      console.error('视频预加载失败:', error)
    }
  }
  const loadAPlayer = async () => {
    if (window.APlayer) {
      await initAPlayer()
      return
    }
    
    try {
      await loadStyle('./APlayer.min.css')
      await loadScript('./APlayer.min.js')
      await initAPlayer()
    } catch (error) {
      console.error('加载 APlayer 资源失败:', error)
    }
  }
  
  const initAPlayer = async () => {
    await loadSongs()
    
    const savedMusicIndex = getMusicIndex()
    aplayer.value = new APlayer({
      container: document.getElementById('aplayer'),
      fixed: true,
      autoplay: true,
      audio: songs.value,
      lrcType: 3,
      theme: '#2980b9',
      loop: 'all',
      order: 'list',
      preload: 'auto',
      volume: 0.7,
      mutex: false,
      listFolded: false,
      listMaxHeight: '200px',
      width: '300px'
    })
    
    if (savedMusicIndex > 0 && savedMusicIndex < songs.value.length) {
      aplayer.value.list.switch(savedMusicIndex)
    }
    
    aplayer.value.on('listswitch', (e) => {
      saveMusicIndex(e.index)
    })
    
    // 设置播放器样式
    const playerElement = document.getElementById('aplayer')
    if (playerElement) {
      playerElement.style.transition = 'opacity 0.3s ease'
      playerElement.style.opacity = '1'
      playerElement.style.pointerEvents = 'auto'
      playerElement.addEventListener('mouseenter', onUIMouseEnter)
      playerElement.addEventListener('mouseleave', onUIMouseLeave)
      playerElement.addEventListener('touchstart', onUITouchStart)
      playerElement.addEventListener('touchend', onUITouchEnd)
    }
    aplayerInitialized.value = true
    setAPlayerInstance(aplayer.value)
  }
  preloadAllVideos()
  setTimeout(() => {
    loadAPlayer()
  }, 500)
})

onUnmounted(() => {
  if (aplayer.value) {
    aplayer.value.destroy()
  }
})
</script>

<style scoped>
.app-container {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.5s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.video-background {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: 1;
}

.overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.3);
  z-index: 2;
}

.content {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  color: white;
  z-index: 3;
  transition: opacity 0.3s ease;
}

.content.hidden {
  opacity: 0;
  pointer-events: none;
}

.title {
  font-size: clamp(1.5rem, 5vw, 3rem);
  margin-bottom: 1rem;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
  white-space: nowrap;
}

.subtitle {
  font-size: clamp(0.85rem, 2vw, 1.2rem);
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5);
}

.switch-video-btn {
  position: absolute;
  top: 20px;
  left: 20px;
  background: rgba(0, 0, 0, 0.5);
  color: white;
  border: none;
  padding: 10px 15px;
  border-radius: 5px;
  cursor: pointer;
  z-index: 1000;
  transition: opacity 0.3s ease;
}

.switch-video-btn.hidden {
  opacity: 0;
  pointer-events: none;
}

.fullscreen-btn {
  position: absolute;
  top: 20px;
  right: 20px;
  background: rgba(0, 0, 0, 0.5);
  color: white;
  border: none;
  padding: 10px 15px;
  border-radius: 5px;
  cursor: pointer;
  z-index: 1000;
  transition: opacity 0.3s ease;
}

.fullscreen-btn.hidden {
  opacity: 0;
  pointer-events: none;
}

.aplayer-container {
  transition: opacity 0.3s ease;
}

.aplayer-container.hidden {
  opacity: 0;
  pointer-events: none;
}

.album-selector {
  position: absolute;
  top: 20px;
  left: 20px;
  z-index: 1000;
  transition: opacity 0.3s ease;
}

.album-selector.hidden {
  opacity: 0;
  pointer-events: none;
}

.album-selector select {
  background: rgba(0, 0, 0, 0.5);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.3);
  padding: 8px 12px;
  border-radius: 5px;
  font-size: 14px;
}

.album-selector select option {
  background: #333;
  color: white;
}

@media (max-width: 490px) {
  .fullscreen-btn {
    position: fixed;
    top: auto;
    bottom: 73px;
    left: 20px;
    right: auto;
    z-index: 4;
  }

  .switch-video-btn {
    position: fixed;
    top: auto;
    bottom: 116px;
    left: 20px;
    right: auto;
    z-index: 4;
  }
}

</style>


<style>
.aplayer-info {
  padding: 14px 7px 0 10px;
}

.aplayer-music {
  flex-grow: 1;
  overflow: visible;
  cursor: pointer;
  position: relative;
  height: 20px;
}

.aplayer-title {
  font-size: 14px;
  display: inline-block;
  white-space: nowrap;
  animation: aplayer-title-scroll 15s linear infinite;
  padding-right: 20px;
}

.aplayer-author {
  font-size: 12px;
  color: #666;
  display: inline-block;
  white-space: nowrap;
  animation: aplayer-author-scroll 15s linear infinite;
  padding-right: 20px;
}

@keyframes aplayer-title-scroll {
  0% {
    transform: translateX(0);
  }
  100% {
    transform: translateX(-100%);
  }
}

@keyframes aplayer-author-scroll {
  0% {
    transform: translateX(0);
  }
  100% {
    transform: translateX(-100%);
  }
}

.aplayer-music:hover .aplayer-title,
.aplayer-music:hover .aplayer-author {
  animation-play-state: running;
}

.aplayer-title,
.aplayer-author {
  animation-play-state: paused;
}

.aplayer-lrc {
  margin-bottom: 10px;
  height: 46px;
  overflow: hidden;
}

.aplayer-lrc-contents p {
  font-size: 14px !important;
  font-weight: 500 !important;
  color: #fff !important;
  opacity: 0.5;
  filter: blur(0.6px);
  transition: all 0.3s ease !important;
  line-height: 20px !important;
  margin: 0 !important;
  padding: 0 !important;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6) !important;
}

.aplayer-lrc-contents p.aplayer-lrc-current {
  opacity: 1;
  filter: blur(0);
  font-size: 16px !important;
  color: #39c5bb !important;
}

#aplayer.lrc-only,
#aplayer.lrc-only .aplayer,
#aplayer.lrc-only .aplayer-body,
#aplayer.lrc-only .aplayer-info {
  background: transparent !important;
  box-shadow: none !important;
  border: none !important;
}
#aplayer.lrc-only .aplayer-pic,
#aplayer.lrc-only .aplayer-info .aplayer-music,
#aplayer.lrc-only .aplayer-controller,
#aplayer.lrc-only .aplayer-list,
#aplayer.lrc-only .aplayer-miniswitcher,
#aplayer.lrc-only .aplayer-notice {
  opacity: 0 !important;
  pointer-events: none !important;
  transition: opacity 0.3s ease;
}
#aplayer.lrc-only .aplayer-lrc {
  opacity: 1 !important;
  transition: opacity 0.3s ease;
}
</style>
