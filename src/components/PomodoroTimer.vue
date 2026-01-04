<template>
  <div>
    <div 
      class="countdown-clock" 
      :class="{ 'settings-open': showSettings }"
      @click="toggleSettings"
      @mouseenter="onUIMouseEnter"
      @mouseleave="onUIMouseLeave"
      @touchstart="onUITouchStart"
      @touchend="onUITouchEnd"
    >
      <div class="online-indicator">
        <span class="online-dot" :class="{ connected: isConnected }"></span>
        <span class="online-text">{{ onlineCount }}</span>
      </div>
      <div class="clock-display">
        <span class="minutes">{{ formattedMinutes }}</span>
        <span class="separator">:</span>
        <span class="seconds">{{ formattedSeconds }}</span>
      </div>
      <div class="status-badge" :class="statusClass">{{ statusText }}</div>
      <div class="system-time">{{ systemTime }}</div>
    </div>
    <transition name="fade">
      <div v-if="showSettings" class="settings-overlay" @click.self="closeSettings" @mouseenter="onUIMouseEnter" @mouseleave="onUIMouseLeave" @touchstart="onUITouchStart" @touchend="onUITouchEnd">
        <div class="settings-panel">
          <div class="settings-header">
            <h3>{{ currentTabTitle }}</h3>
            <button class="close-btn" @click="closeSettings">×</button>
          </div>
          <div class="settings-body">
            <div class="settings-nav">
              <button class="nav-item" :class="{ active: currentTab === 'pomodoro' }" @click="currentTab = 'pomodoro'">番茄钟</button>
              <button class="nav-item" :class="{ active: currentTab === 'playlist' }" @click="currentTab = 'playlist'">歌单</button>
              <button class="nav-item" :class="{ active: currentTab === 'stats' }" @click="currentTab = 'stats'">学习数据</button>
              <button class="nav-item" :class="{ active: currentTab === 'updates' }" @click="currentTab = 'updates'">更新日志</button>
              <button class="nav-item" :class="{ active: currentTab === 'quickstudy' }" @click="currentTab = 'quickstudy'">一键学习</button>
              <button class="nav-item" :class="{ active: currentTab === 'about' }" @click="currentTab = 'about'">关于</button>
            </div>
            <div class="settings-content">
              <div v-if="currentTab === 'pomodoro'" class="timer-container">
                <div class="status-indicator">
                  <span class="status-text" :class="statusClass">{{ statusText }}</span>
                </div>
                <div class="timer-display">
                  <div class="time-circle">
                    <svg class="progress-ring" width="120" height="120">
                      <circle class="progress-ring-background" cx="60" cy="60" r="54" stroke="rgba(255, 255, 255, 0.2)" stroke-width="5" fill="transparent"/>
                      <circle class="progress-ring-fill" :class="statusClass" cx="60" cy="60" r="54" stroke="currentColor" stroke-width="5" fill="transparent" :stroke-dasharray="circumference" :stroke-dashoffset="strokeDashoffset" transform="rotate(-90 60 60)"/>
                    </svg>
                    <div class="time-text">
                      <span class="minutes">{{ formattedMinutes }}</span>
                      <span class="separator">:</span>
                      <span class="seconds">{{ formattedSeconds }}</span>
                    </div>
                  </div>
                </div>
                <div class="timer-controls">
                  <button v-if="!isRunning" class="control-btn start-btn" @click="startTimer" :disabled="timeLeft <= 0"><span class="btn-icon">▶</span></button>
                  <button v-else class="control-btn pause-btn" @click="pauseTimer"><span class="btn-icon">⏸</span></button>
                  <button class="control-btn reset-btn" @click="resetTimer"><span class="btn-icon">↺</span></button>
                </div>
                <div class="timer-settings">
                  <div class="setting-group">
                    <label>专注时间(分钟)</label>
                    <input type="number" v-model.number="focusDuration" min="1" max="60" :disabled="isRunning"/>
                  </div>
                  <div class="setting-group">
                    <label>休息时间(分钟)</label>
                    <input type="number" v-model.number="breakDuration" min="1" max="30" :disabled="isRunning"/>
                  </div>
                  <div class="setting-group">
                    <label>专注结束时暂停音乐</label>
                    <label class="toggle-switch">
                      <input type="checkbox" v-model="pauseMusicOnFocusEnd" @change="saveMusicPauseSettings(pauseMusicOnFocusEnd, pauseMusicOnBreakEnd)"/>
                      <span class="toggle-slider"></span>
                    </label>
                  </div>
                  <div class="setting-group">
                    <label>休息结束时暂停音乐</label>
                    <label class="toggle-switch">
                      <input type="checkbox" v-model="pauseMusicOnBreakEnd" @change="saveMusicPauseSettings(pauseMusicOnFocusEnd, pauseMusicOnBreakEnd)"/>
                      <span class="toggle-slider"></span>
                    </label>
                  </div>
                </div>
                <div class="pomodoro-count">
                  <span class="count-label">已完成番茄:</span>
                  <div class="count-display">
                    <span v-for="i in 4" :key="i" class="pomodoro-dot" :class="{ filled: completedPomodoros >= i }"></span>
                  </div>
                </div>
              </div>

              <div v-else-if="currentTab === 'playlist'" class="playlist-container">
                <div class="setting-group">
                  <label>平台</label>
                  <select v-model="selectedPlatform" class="platform-select">
                    <option v-for="p in PLATFORMS" :key="p.value" :value="p.value">{{ p.label }}</option>
                  </select>
                </div>
                <div class="setting-group">
                  <label>歌单ID</label>
                  <input type="text" v-model="inputPlaylistId" placeholder="歌单ID"/>
                </div>
                <div class="playlist-actions">
                  <button class="action-btn apply-btn" @click="applyPlaylist">获取</button>
                  <button class="action-btn reset-playlist-btn" @click="resetPlaylist">恢复默认</button>
                  <button class="action-btn jazz-btn" @click="applyJazzPlaylist">站长神秘歌单</button>
                </div>
                <a class="help-link" href="https://www.bilibili.com/opus/1144256090307821590" target="_blank">歌单ID怎么获取?</a>
              </div>

              <div v-else-if="currentTab === 'stats'" class="stats-container">
                <div class="login-section">
                  <p class="login-hint">登录MikuMod账号后可云端同步学习数据</p>
                  <button class="action-btn login-btn" disabled>即将开放</button>
                </div>
                <div class="stat-item"><span class="stat-label">总学习时长</span><span class="stat-value">{{ formatStudyTime(studyStats.totalStudyTime) }}</span></div>
                <div class="stat-item"><span class="stat-label">完成番茄数</span><span class="stat-value">{{ studyStats.totalPomodoros }}</span></div>
                <div class="stat-item"><span class="stat-label">今日学习</span><span class="stat-value">{{ formatStudyTime(studyStats.todayStudyTime) }}</span></div>
                <div class="stat-item"><span class="stat-label">今日番茄</span><span class="stat-value">{{ studyStats.todayPomodoros }}</span></div>
              </div>

              <div v-else-if="currentTab === 'updates'">
                <Updates />
              </div>

              <div v-else-if="currentTab === 'quickstudy'" class="quickstudy-container">
                <div class="quickstudy-content">
                  <p>更换为exe格式，比url更好看＞﹏＜</p>
                  <a class="quickstudy-link" href="https://pan.quark.cn/s/f89e455f54b4" target="_blank" rel="noopener noreferrer">一键开始学习</a>
                </div>
              </div>

              <div v-else-if="currentTab === 'about'" class="about-container">
                <div class="about-content">
                  <p>1.StudyWithMiku是一个基于STUDYWITHMIKU企划的免费开源沉浸式学习陪伴网站</p>
                  <p>2.项目代码在github开源，欢迎点上star！</p>
                  <p>3.项目部署域名：study.mikugame.icu和study.mikumod.com</p>
                  <p>4.希望你可以喜欢！在悠闲的音乐里和初音一起学习吧~</p>
                </div>
                <div class="runtime-display">
                  <div class="runtime-label">网站已运行</div>
                  <div class="runtime-time">
                    <span class="runtime-value">{{ runtimeDays }}</span>
                    <span class="runtime-unit">天</span>
                    <span class="runtime-value">{{ runtimeHours }}</span>
                    <span class="runtime-unit">时</span>
                    <span class="runtime-value">{{ runtimeMinutes }}</span>
                    <span class="runtime-unit">分</span>
                    <span class="runtime-value">{{ runtimeSeconds }}</span>
                    <span class="runtime-unit">秒</span>
                  </div>
                </div>
                <div class="about-links">
                  <a href="https://github.com/shshouse/StudyWithMiku" target="_blank" rel="noopener noreferrer" class="about-link">
                    <svg class="icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                    <span>GitHub仓库</span>
                  </a>
                  <a href="https://space.bilibili.com/309820452" target="_blank" rel="noopener noreferrer" class="about-link">
                    <svg class="icon" viewBox="0 0 24 24" fill="currentColor"><path d="M17.813 4.653h.854c1.51.054 2.769.578 3.773 1.574 1.004.995 1.524 2.249 1.56 3.76v7.36c-.036 1.51-.556 2.769-1.56 3.773s-2.262 1.524-3.773 1.56H5.333c-1.51-.036-2.769-.556-3.773-1.56S.036 18.858 0 17.347v-7.36c.036-1.511.556-2.765 1.56-3.76 1.004-.996 2.262-1.52 3.773-1.574h.774l-1.174-1.12a1.234 1.234 0 0 1-.373-.906c0-.356.124-.658.373-.907l.027-.027c.267-.249.573-.373.92-.373.347 0 .653.124.92.373L9.653 4.44c.071.071.134.142.187.213h4.267a.836.836 0 0 1 .16-.213l2.853-2.747c.267-.249.573-.373.92-.373.347 0 .662.151.929.4.267.249.391.551.391.907 0 .355-.124.657-.373.906zM5.333 7.24c-.746.018-1.373.276-1.88.773-.506.498-.769 1.13-.786 1.894v7.52c.017.764.28 1.395.786 1.893.507.498 1.134.756 1.88.773h13.334c.746-.017 1.373-.275 1.88-.773.506-.498.769-1.129.786-1.893v-7.52c-.017-.765-.28-1.396-.786-1.894-.507-.497-1.134-.755-1.88-.773zM8 11.107c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c0-.373.129-.689.386-.947.258-.257.574-.386.947-.386zm8 0c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c.017-.391.15-.711.4-.96.249-.249.56-.373.933-.373z"/></svg>
                    <span>Bilibili</span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, reactive } from 'vue'
import { useOnlineCount } from '../composables/useOnlineCount.js'
import { useMusic } from '../composables/useMusic.js'
import { duckMusicForNotification, setHoveringUI, getAPlayerInstance } from '../utils/eventBus.js'
import { getPomodoroSettings, savePomodoroSettings, saveMusicPauseSettings } from '../utils/userSettings.js'
import Updates from './Updates.vue'

const { onlineCount, isConnected } = useOnlineCount(import.meta.env.VITE_WS_URL)
const { playlistId, platform, applyCustomPlaylist, resetToLocal, songs, DEFAULT_PLAYLIST_ID, PLATFORMS } = useMusic()

const inputPlaylistId = ref('')
const selectedPlatform = ref(platform.value)
const currentTab = ref('pomodoro')
const currentTabTitle = computed(() => ({ pomodoro: '番茄钟设置', playlist: '歌单设置', stats: '学习数据', updates: '更新日志', quickstudy: '一键学习', about: '关于' }[currentTab.value]))

const STATS_KEY = 'study_stats'
const getToday = () => new Date().toDateString()
const loadStats = () => {
  try {
    const saved = localStorage.getItem(STATS_KEY)
    if (saved) {
      const data = JSON.parse(saved)
      if (data.lastDate !== getToday()) { data.todayStudyTime = 0; data.todayPomodoros = 0; data.lastDate = getToday(); localStorage.setItem(STATS_KEY, JSON.stringify(data)) }
      return data
    }
  } catch {}
  return { totalStudyTime: 0, totalPomodoros: 0, todayStudyTime: 0, todayPomodoros: 0, lastDate: getToday() }
}
const studyStats = reactive(loadStats())
const saveStats = () => localStorage.setItem(STATS_KEY, JSON.stringify(studyStats))
const addStudyTime = (seconds) => { studyStats.totalStudyTime += seconds; studyStats.todayStudyTime += seconds; saveStats() }
const addPomodoro = () => { studyStats.totalPomodoros++; studyStats.todayPomodoros++; saveStats() }
const resetStats = () => { studyStats.totalStudyTime = 0; studyStats.totalPomodoros = 0; studyStats.todayStudyTime = 0; studyStats.todayPomodoros = 0; studyStats.lastDate = getToday(); saveStats() }
const formatStudyTime = (seconds) => { const h = Math.floor(seconds / 3600); const m = Math.floor((seconds % 3600) / 60); return h > 0 ? `${h}小时${m}分钟` : `${m}分钟` }

const applyPlaylist = async () => { if (!inputPlaylistId.value) return; await applyCustomPlaylist(selectedPlatform.value, inputPlaylistId.value); const ap = getAPlayerInstance(); if (ap) { ap.list.clear(); ap.list.add(songs.value) } }
const resetPlaylist = async () => { inputPlaylistId.value = ''; await resetToLocal(); const ap = getAPlayerInstance(); if (ap) { ap.list.clear(); ap.list.add(songs.value) } }
const applyJazzPlaylist = async () => { await applyCustomPlaylist('netease', '8894040639'); const ap = getAPlayerInstance(); if (ap) { ap.list.clear(); ap.list.add(songs.value) } }

const STATUS = { FOCUS: 'focus', BREAK: 'break', LONG_BREAK: 'longBreak' }
const savedPomodoro = getPomodoroSettings()
const focusDuration = ref(savedPomodoro.focusDuration)
const breakDuration = ref(savedPomodoro.breakDuration)
const pauseMusicOnFocusEnd = ref(savedPomodoro.pauseMusicOnFocusEnd || false)
const pauseMusicOnBreakEnd = ref(savedPomodoro.pauseMusicOnBreakEnd || false)
const timeLeft = ref(focusDuration.value * 60)
const isRunning = ref(false)
const currentStatus = ref(STATUS.FOCUS)
const completedPomodoros = ref(0)
const showSettings = ref(false)
const currentTime = ref(new Date())
const systemTime = computed(() => `${currentTime.value.getHours().toString().padStart(2, '0')}:${currentTime.value.getMinutes().toString().padStart(2, '0')}`)
const startDate = new Date('2025-12-02T00:00:00')
const runtimeDays = computed(() => Math.floor((currentTime.value - startDate) / (1000 * 60 * 60 * 24)))
const runtimeHours = computed(() => Math.floor((currentTime.value - startDate) % (1000 * 60 * 60 * 24) / (1000 * 60 * 60)))
const runtimeMinutes = computed(() => Math.floor((currentTime.value - startDate) % (1000 * 60 * 60) / (1000 * 60)))
const runtimeSeconds = computed(() => Math.floor((currentTime.value - startDate) % (1000 * 60) / 1000))
let timeInterval = null
let timer = null
let studyTimeCounter = 0

watch(focusDuration, (newVal) => { if (currentStatus.value === STATUS.FOCUS && !isRunning.value) timeLeft.value = newVal * 60; savePomodoroSettings(newVal, breakDuration.value) })
watch(breakDuration, (newVal) => { if (currentStatus.value !== STATUS.FOCUS && !isRunning.value) timeLeft.value = newVal * 60; savePomodoroSettings(focusDuration.value, newVal) })

const formattedMinutes = computed(() => Math.floor(timeLeft.value / 60).toString().padStart(2, '0'))
const formattedSeconds = computed(() => (timeLeft.value % 60).toString().padStart(2, '0'))
const statusText = computed(() => ({ [STATUS.FOCUS]: '专注', [STATUS.BREAK]: '休息', [STATUS.LONG_BREAK]: '长休' }[currentStatus.value] || '专注'))
const statusClass = computed(() => ({ [STATUS.FOCUS]: 'focus', [STATUS.BREAK]: 'break', [STATUS.LONG_BREAK]: 'long-break' }[currentStatus.value] || 'focus'))
const circumference = computed(() => 2 * Math.PI * 54)
const strokeDashoffset = computed(() => { const totalTime = currentStatus.value === STATUS.FOCUS ? focusDuration.value * 60 : breakDuration.value * 60; return circumference.value * (1 - (totalTime - timeLeft.value) / totalTime) })

const toggleSettings = () => { showSettings.value = !showSettings.value }
const closeSettings = () => { showSettings.value = false }

const startTimer = () => {
  if (timeLeft.value <= 0) return
  isRunning.value = true
  studyTimeCounter = 0
  timer = setInterval(() => {
    timeLeft.value--
    if (currentStatus.value === STATUS.FOCUS) {
      studyTimeCounter++
      if (studyTimeCounter >= 60) { addStudyTime(60); studyTimeCounter = 0 }
    }
    if (timeLeft.value <= 0) {
      if (currentStatus.value === STATUS.FOCUS && studyTimeCounter > 0) addStudyTime(studyTimeCounter)
      clearInterval(timer)
      handleTimerComplete()
    }
  }, 1000)
}
const pauseTimer = () => {
  isRunning.value = false
  if (currentStatus.value === STATUS.FOCUS && studyTimeCounter > 0) { addStudyTime(studyTimeCounter); studyTimeCounter = 0 }
  if (timer) { clearInterval(timer); timer = null }
}
const resetTimer = () => { pauseTimer(); timeLeft.value = focusDuration.value * 60; currentStatus.value = STATUS.FOCUS }
const handleTimerComplete = () => {
  playNotificationSound()
  const completedStatus = currentStatus.value
  if (currentStatus.value === STATUS.FOCUS) {
    completedPomodoros.value++
    addPomodoro()
    if (completedPomodoros.value % 4 === 0) { currentStatus.value = STATUS.LONG_BREAK; timeLeft.value = breakDuration.value * 60 * 2 }
    else { currentStatus.value = STATUS.BREAK; timeLeft.value = breakDuration.value * 60 }
    if (pauseMusicOnFocusEnd.value) {
      const ap = getAPlayerInstance()
      if (ap) ap.pause()
    }
  } else {
    currentStatus.value = STATUS.FOCUS
    timeLeft.value = focusDuration.value * 60
    if (pauseMusicOnBreakEnd.value) {
      const ap = getAPlayerInstance()
      if (ap) ap.pause()
    }
  }
  const statusTextMap = { [STATUS.FOCUS]: '专注', [STATUS.BREAK]: '休息', [STATUS.LONG_BREAK]: '长休' }
  if (Notification.permission === 'granted') new Notification('番茄钟', { body: `${statusTextMap[completedStatus]}已完成！`, icon: '/favicon.ico' })
  setTimeout(() => { startTimer() }, 1000)
}
const playNotificationSound = async () => { duckMusicForNotification(3000); await new Promise(r => setTimeout(r, 200)); new Audio('/BreakOrWork.mp3').play() }
const showNotification = () => { if (Notification.permission === 'granted') new Notification('番茄钟', { body: `${statusText.value}已完成！`, icon: '/favicon.ico' }) }
const onUIMouseEnter = () => { setHoveringUI(true) }
const onUIMouseLeave = () => { setHoveringUI(false) }
const onUITouchStart = () => { setHoveringUI(true) }
const onUITouchEnd = () => { setHoveringUI(false) }
onMounted(() => { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); timeInterval = setInterval(() => { currentTime.value = new Date() }, 1000) })
onUnmounted(() => { if (timer) clearInterval(timer); if (timeInterval) clearInterval(timeInterval) })
</script>

<style scoped>
.countdown-clock {
  position: fixed; top: 20px; left: 50%; transform: translateX(-50%); z-index: 1001; cursor: pointer;
  transition: all 0.3s ease; background: rgba(255, 255, 255, 0.1); backdrop-filter: blur(20px);
  border-radius: 10px; padding: 0.8rem 1.2rem; border: 1px solid rgba(255, 255, 255, 0.2);
  display: flex; align-items: center; gap: 1rem; color: white; font-family: 'Courier New', monospace;
}
.system-time { font-size: 0.9rem; font-weight: 500; opacity: 0.8; padding-left: 1rem; border-left: 1px solid rgba(255, 255, 255, 0.2); }
.online-indicator { display: flex; align-items: center; gap: 0.5rem; padding-right: 1rem; border-right: 1px solid rgba(255, 255, 255, 0.2); }
.online-dot { width: 8px; height: 8px; border-radius: 50%; background: #666; transition: background 0.3s ease; }
.online-dot.connected { background: #4caf50; box-shadow: 0 0 8px rgba(76, 175, 80, 0.6); }
.online-text { font-size: 0.9rem; font-weight: 500; opacity: 0.9; }
.countdown-clock:hover { background: rgba(255, 255, 255, 0.15); transform: translateX(-50%) translateY(-2px); }
.countdown-clock.settings-open { background: rgba(255, 255, 255, 0.2); border-color: rgba(255, 255, 255, 0.4); }
.clock-display { font-size: 1.5rem; font-weight: 600; }
.status-badge { padding: 0.3rem 0.8rem; border-radius: 15px; font-size: 0.8rem; font-weight: 500; background: rgba(255, 255, 255, 0.1); }
.status-badge.focus { color: #ff6b6b; }
.status-badge.break { color: #4ecdc4; }
.status-badge.long-break { color: #45b7d1; }
.settings-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0, 0, 0, 0.7); display: flex; justify-content: center; align-items: center; z-index: 1002; }
.settings-panel { background: rgba(255, 255, 255, 0.1); backdrop-filter: blur(30px); border-radius: 20px; border: 1px solid rgba(255, 255, 255, 0.2); width: 90%; max-width: 550px; height: 70vh; max-height: 90vh; overflow: hidden; display: flex; flex-direction: column; }
.settings-header { display: flex; justify-content: space-between; align-items: center; padding: 1.2rem 1.5rem; border-bottom: 1px solid rgba(255, 255, 255, 0.1); flex-shrink: 0; }
.settings-header h3 { color: white; margin: 0; font-size: 1.1rem; }
.close-btn { background: none; border: none; color: white; font-size: 1.5rem; cursor: pointer; padding: 0.2rem; border-radius: 50%; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; transition: background 0.3s ease; flex-shrink: 0; }
.close-btn:hover { background: rgba(255, 255, 255, 0.1); }
.settings-body { display: flex; flex: 1; overflow: hidden; }
.settings-nav { display: flex; flex-direction: column; padding: 1rem 0; border-right: 1px solid rgba(255, 255, 255, 0.1); min-width: 100px; overflow-y: auto; flex-shrink: 0; }
.nav-item { background: none; border: none; color: rgba(255, 255, 255, 0.6); padding: 0.8rem 1.2rem; text-align: left; cursor: pointer; transition: all 0.3s ease; font-size: 0.85rem; white-space: nowrap; }
.nav-item:hover { color: white; background: rgba(255, 255, 255, 0.05); }
.nav-item.active { color: white; background: rgba(255, 255, 255, 0.1); border-left: 2px solid #ff6b6b; }
.settings-content { flex: 1; overflow-y: auto; padding: 1rem 1.5rem; min-height: 0; }

.settings-content::-webkit-scrollbar {
  width: 6px;
}

.settings-content::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 3px;
}

.settings-content::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
}

.settings-content::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}

.timer-container { text-align: center; color: white; }
.status-indicator { margin-bottom: 1rem; }
.status-text { font-size: 1rem; font-weight: 500; padding: 0.4rem 0.8rem; border-radius: 20px; background: rgba(255, 255, 255, 0.1); }
.status-text.focus { color: #ff6b6b; }
.status-text.break { color: #4ecdc4; }
.status-text.long-break { color: #45b7d1; }
.timer-display { margin-bottom: 1.5rem; }
.time-circle { position: relative; display: inline-block; }
.progress-ring { display: block; width: 120px; height: 120px; }
.progress-ring-fill.focus { color: #ff6b6b; }
.progress-ring-fill.break { color: #4ecdc4; }
.progress-ring-fill.long-break { color: #45b7d1; }
.time-text { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 1.8rem; font-weight: 300; font-family: 'Courier New', monospace; }
.timer-controls { display: flex; gap: 0.4rem; justify-content: center; margin-bottom: 1.5rem; }
.control-btn { background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.3); border-radius: 8px; padding: 0.6rem 0.8rem; color: white; cursor: pointer; transition: all 0.3s ease; display: flex; align-items: center; gap: 0.3rem; font-size: 0.8rem; }
.control-btn:hover:not(:disabled) { background: rgba(255, 255, 255, 0.2); transform: translateY(-2px); }
.control-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.start-btn { background: rgba(76, 175, 80, 0.3); border-color: rgba(76, 175, 80, 0.5); }
.pause-btn { background: rgba(255, 193, 7, 0.3); border-color: rgba(255, 193, 7, 0.5); }
.reset-btn { background: rgba(244, 67, 54, 0.3); border-color: rgba(244, 67, 54, 0.5); }
.btn-icon { font-size: 1rem; }
.timer-settings { margin-bottom: 1rem; }
.setting-group { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.8rem; font-size: 0.8rem; }
.setting-group label { opacity: 0.8; }
.setting-group input[type="number"] { background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.3); border-radius: 4px; padding: 0.2rem 0.4rem; color: white; width: 50px; text-align: center; }
.setting-group input[type="number"]:focus { outline: none; border-color: rgba(255, 255, 255, 0.6); }
.setting-group input[type="number"]:disabled { opacity: 0.5; }
.toggle-switch { position: relative; display: inline-block; width: 44px; height: 24px; margin: 0; }
.toggle-switch input { opacity: 0; width: 0; height: 0; }
.toggle-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background: rgba(255, 255, 255, 0.1); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.3); border-radius: 24px; transition: all 0.3s ease; }
.toggle-slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 2.5px; background: rgba(255, 255, 255, 0.8); border-radius: 50%; transition: all 0.3s ease; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2); }
.toggle-switch input:checked + .toggle-slider { background: rgba(255, 107, 107, 0.3); border-color: rgba(255, 107, 107, 0.5); }
.toggle-switch input:checked + .toggle-slider:before { transform: translateX(20px); background: #ff6b6b; }
.toggle-switch:hover .toggle-slider { background: rgba(255, 255, 255, 0.15); border-color: rgba(255, 255, 255, 0.4); }
.toggle-switch input:checked:hover + .toggle-slider { background: rgba(255, 107, 107, 0.4); border-color: rgba(255, 107, 107, 0.6); }
.pomodoro-count { display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; opacity: 0.8; }
.count-display { display: flex; gap: 0.2rem; }
.pomodoro-dot { width: 6px; height: 6px; border-radius: 50%; background: rgba(255, 255, 255, 0.2); transition: background 0.3s ease; }
.pomodoro-dot.filled { background: #ff6b6b; }
.playlist-settings { margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid rgba(255, 255, 255, 0.1); }
.playlist-container { padding: 2rem 0; display: flex; flex-direction: column; align-items: center; }
.playlist-container .setting-group { margin-bottom: 1.5rem; width: 100%; max-width: 400px; display: flex; align-items: center; gap: 1rem; }
.playlist-container .setting-group label { display: inline-block; margin-bottom: 0; font-size: 0.95rem; color: rgba(255, 255, 255, 0.9); min-width: 60px; flex-shrink: 0; }
.playlist-container .setting-group input { flex: 1; text-align: left; padding: 0.6rem 1rem; background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; color: white; font-size: 0.95rem; transition: all 0.3s ease; }
.playlist-container .setting-group input:focus { outline: none; border-color: rgba(41, 128, 185, 0.6); background: rgba(255, 255, 255, 0.12); }
.playlist-container .setting-group input::placeholder { color: rgba(255, 255, 255, 0.4); }
.playlist-settings .setting-group input { width: 140px; text-align: left; padding: 0.3rem 0.5rem; }
.platform-select { background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.3); border-radius: 4px; padding: 0.6rem 1rem; color: white; flex: 1; cursor: pointer; }
.playlist-container .platform-select { background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; }
.playlist-container .platform-select:focus { outline: none; border-color: rgba(41, 128, 185, 0.6); background: rgba(255, 255, 255, 0.12); }
.platform-select option { background: #333; color: white; }
.playlist-actions { display: flex; gap: 0.8rem; margin-top: 1.5rem; justify-content: center; flex-wrap: wrap; }
.playlist-container .action-btn { padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.85rem; }
.playlist-container .help-link { margin-top: 1.5rem; font-size: 0.85rem; padding: 0.6rem 1rem; background: rgba(255, 255, 255, 0.05); border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.1); transition: all 0.3s ease; }
.playlist-container .help-link:hover { background: rgba(255, 255, 255, 0.1); border-color: rgba(255, 255, 255, 0.2); }
.action-btn { padding: 0.4rem 0.8rem; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.3); background: rgba(255, 255, 255, 0.1); color: white; font-size: 0.75rem; cursor: pointer; transition: all 0.3s ease; }
.action-btn:hover { background: rgba(255, 255, 255, 0.2); }
.apply-btn { background: rgba(76, 175, 80, 0.3); border-color: rgba(76, 175, 80, 0.5); }
.reset-playlist-btn { background: rgba(255, 152, 0, 0.3); border-color: rgba(255, 152, 0, 0.5); }
.help-link { display: block; margin-top: 0.8rem; font-size: 0.7rem; color: rgba(255, 255, 255, 0.6); text-decoration: none; text-align: center; transition: color 0.3s ease; }
.help-link:hover { color: rgba(255, 255, 255, 0.9); text-decoration: underline; }


.stats-container { color: white; padding: 1rem 0; }
.login-section { text-align: center; padding: 1rem; margin-bottom: 1rem; background: rgba(255, 255, 255, 0.05); border-radius: 10px; border: 1px solid rgba(255, 255, 255, 0.1); }
.login-hint { font-size: 0.85rem; color: rgba(255, 255, 255, 0.7); margin: 0 0 0.8rem 0; }
.login-btn { background: rgba(57, 197, 187, 0.3); border-color: rgba(57, 197, 187, 0.5); width: auto; padding: 0.5rem 1.5rem; }
.login-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.stat-item { display: flex; justify-content: space-between; align-items: center; padding: 1rem; margin-bottom: 0.8rem; background: rgba(255, 255, 255, 0.05); border-radius: 10px; border: 1px solid rgba(255, 255, 255, 0.1); }
.stat-label { font-size: 0.9rem; opacity: 0.8; }
.stat-value { font-size: 1.1rem; font-weight: 600; color: #ff6b6b; }
.reset-stats-btn { margin-top: 1rem; width: 100%; background: rgba(244, 67, 54, 0.3); border-color: rgba(244, 67, 54, 0.5); }
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.about-container { color: white; padding: 2rem 0; text-align: center; }
.about-content { margin-bottom: 2rem; text-align: left; max-width: 500px; margin: 0 auto 2rem; }
.about-content p { margin-bottom: 1rem; font-size: 0.9rem; line-height: 1.5; opacity: 0.9; }
.runtime-display { margin-bottom: 2rem; padding: 1.5rem; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 10px; }
.runtime-label { font-size: 0.9rem; opacity: 0.8; margin-bottom: 0.8rem; }
.runtime-time { display: flex; justify-content: center; align-items: baseline; gap: 0.3rem; font-family: 'Courier New', monospace; }
.runtime-value { font-size: 1.5rem; font-weight: 600; color: #4ecdc4; }
.runtime-unit { font-size: 0.9rem; opacity: 0.7; }
.about-links { display: flex; flex-direction: column; gap: 1rem; align-items: center; }
.about-link { display: flex; align-items: center; gap: 0.8rem; padding: 1rem 2rem; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 10px; color: white; text-decoration: none; transition: all 0.3s ease; width: 200px; justify-content: center; }
.about-link:hover { background: rgba(255, 255, 255, 0.15); transform: translateY(-2px); }
.about-link .icon { width: 24px; height: 24px; }

.quickstudy-container { color: white; padding: 2rem 0; text-align: center; }
.quickstudy-content { max-width: 400px; margin: 0 auto; }
.quickstudy-content p { margin-bottom: 1.5rem; font-size: 0.9rem; opacity: 0.9; }
.quickstudy-link { display: inline-block; padding: 1rem 2rem; background: rgba(76, 175, 80, 0.3); border: 1px solid rgba(76, 175, 80, 0.5); border-radius: 10px; color: white; text-decoration: none; font-size: 1rem; font-weight: 500; transition: all 0.3s ease; }
.quickstudy-link:hover { background: rgba(76, 175, 80, 0.5); transform: translateY(-2px); }
</style>
