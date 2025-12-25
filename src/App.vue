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
        @loadeddata="onVideoLoaded"
      ></video>
    </transition>
    <div class="overlay"></div>
    <div class="content" :class="{ hidden: !showControls }">
      <h1 class="title">Study with Miku</h1>
      <p class="subtitle">Love by SHSHOUSE</p>
    </div>
    <button class="switch-video-btn" @click="switchVideo" :class="{ hidden: !showControls }" @mouseenter="onUIMouseEnter" @mouseleave="onUIMouseLeave" @touchstart="onUITouchStart" @touchend="onUITouchEnd">
      切换
    </button>
    
    <button class="fullscreen-btn" @click="toggleFullscreen" :class="{ hidden: !showControls }" @mouseenter="onUIMouseEnter" @mouseleave="onUIMouseLeave" @touchstart="onUITouchStart" @touchend="onUITouchEnd">
      {{ isFullscreen ? '退出全屏' : '全屏' }}
    </button>
    
    <!-- 番茄钟！＞﹏＜ -->
    <PomodoroTimer />
    
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

const { isFullscreen, toggle: toggleFullscreen } = useFullscreen()
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

const videos = isR2Domain
  ? [
      `${R2_BASE_URL}/1.mp4`,
      `${R2_BASE_URL}/2.mp4`,
      `${R2_BASE_URL}/3.mp4`
    ]
  : [
      '/1.mp4',
      '/2.mp4',
      '/3.mp4'
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

const onVideoLoaded = () => {
  console.log('视频加载完成')
}

// 监听显示/隐藏状态变化
watch(showControls, (newValue) => {
  if (aplayer.value && aplayerInitialized.value) {
    const playerElement = document.getElementById('aplayer')
    if (playerElement) {
      if (newValue) {
        // 显示播放器
        playerElement.style.opacity = '1'
        playerElement.style.pointerEvents = 'auto'
      } else {
        // 隐藏播放器
        playerElement.style.opacity = '0'
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
      lrcType: 0,
      theme: '#2980b9',
      loop: 'all',
      order: 'list',
      preload: 'auto',
      volume: 0.7,
      mutex: true,
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
  font-size: 3rem;
  margin-bottom: 1rem;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
}

.subtitle {
  font-size: 1.2rem;
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

/* 窄屏适配 */
@media (max-width: 490px) {
  .fullscreen-btn {
    top: auto;
    bottom: 73px;
    left: 20px;
    right: auto;
    z-index: 4;    /* 防止盖住APlayer */
  }

  .switch-video-btn {
    top: auto;
    bottom: 116px;
    left: 20px;
    right: auto;
    z-index: 4;
  }
}
</style>