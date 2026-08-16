<template>
  <div class="calendar-container">
    <!-- 月度统计 -->
    <div class="month-stats">
      <div class="month-stat-item">
        <span class="month-stat-value">{{ monthStats.activeDays }}</span>
        <span class="month-stat-label">活跃天数</span>
      </div>
      <div class="month-stat-item">
        <span class="month-stat-value">{{ formatTime(monthStats.totalTime) }}</span>
        <span class="month-stat-label">总学习</span>
      </div>
      <div class="month-stat-item">
        <span class="month-stat-value">{{ monthStats.totalPomodoros }}</span>
        <span class="month-stat-label">番茄数</span>
      </div>
    </div>

    <!-- 月份导航 -->
    <div class="calendar-header">
      <button class="nav-btn" @click="prevMonth">&lt;</button>
      <span class="month-title" @click="goToday">{{ year }}年{{ month + 1 }}月</span>
      <button class="nav-btn" @click="nextMonth">&gt;</button>
    </div>

    <!-- 星期标题 -->
    <div class="weekday-row">
      <span v-for="w in weekdays" :key="w" class="weekday-cell">{{ w }}</span>
    </div>

    <!-- 日历网格 -->
    <div class="calendar-grid">
      <div
        v-for="d in calendarDays"
        :key="d.date"
        class="day-cell"
        :class="{
          'other-month': !d.isCurrentMonth,
          'today': d.date === today,
          'selected': d.date === selectedDate,
          [`heat-${getHeatLevel(d.date)}`]: d.isCurrentMonth,
        }"
        @click="selectDate(d.date)"
      >
        <span
          v-if="d.isCurrentMonth && countdownsOfDate(d.date).length"
          class="day-countdown-badge"
          :title="countdownsOfDate(d.date).map(c => c.title).join(' / ')"
        >{{ firstCountdownChar(d.date) }}</span>
        <span class="day-number">{{ d.day }}</span>
        <span
          v-if="getDayLog(d.date).studyTime >= 60 || getDayLog(d.date).pomodoros > 0"
          class="day-info"
        >
          <span v-if="getDayLog(d.date).studyTime >= 60" class="day-study-time">
            {{ formatTime(getDayLog(d.date).studyTime) }}
          </span>
          <span v-if="getDayLog(d.date).pomodoros > 0" class="day-pomodoro">
            <svg class="tomato-icon" viewBox="0 0 14 14" aria-hidden="true">
              <circle cx="7" cy="8.5" r="5" fill="#ff5f56"/>
              <path d="M7 5.5C6.2 3.8 4.4 3 2.8 3.6c2.1 1.4 2.7 2.1 4.2 1.9 1.5.2 2.1-.5 4.2-1.9C9.6 3 7.8 3.8 7 5.5z" fill="#4caf50"/>
            </svg>
            {{ getDayLog(d.date).pomodoros }}
          </span>
        </span>
      </div>
    </div>

    <!-- 热力图图例 -->
    <div class="heat-legend">
      <span class="legend-label">少</span>
      <span class="legend-block heat-0"></span>
      <span class="legend-block heat-1"></span>
      <span class="legend-block heat-2"></span>
      <span class="legend-block heat-3"></span>
      <span class="legend-block heat-4"></span>
      <span class="legend-label">多</span>
    </div>

    <div class="countdown-section">
      <div class="countdown-header">
        <span class="countdown-title">倒数日</span>
        <span class="countdown-count">{{ countdowns.length }}/{{ MAX_COUNT }}</span>
      </div>
      <div class="countdown-input-row">
        <input
          v-model="newCountdownTitle"
          type="text"
          placeholder="标题..."
          maxlength="40"
          class="countdown-input"
          @keyup.enter="handleAddCountdown"
        />
        <input v-model="newCountdownDate" type="date" class="countdown-date-input" />
        <button class="add-countdown-btn" @click="handleAddCountdown" title="添加倒数日">+</button>
      </div>
      <p v-if="countdownTip" class="countdown-tip">{{ countdownTip }}</p>
      <div v-if="sortedCountdowns.length" class="countdown-list">
        <div
          v-for="c in sortedCountdowns"
          :key="c.id"
          class="countdown-item"
          :class="{ expired: countdownDaysOf(c) < 0 }"
        >
          <span class="countdown-item-title" :title="c.title">{{ c.title }}</span>
          <span class="countdown-days">{{ countdownTextOf(c) }}</span>
          <button class="countdown-share-btn" @click="emit('share-countdown', c)" title="分享到聊天室">分享</button>
          <button class="delete-countdown-btn" @click="deleteCountdown(c.id)">&times;</button>
        </div>
      </div>
      <div v-else class="empty-countdowns">暂无倒数日，添加一个吧</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onUnmounted } from 'vue'
import { useCalendar } from '../composables/useCalendar.js'
import { useCountdown, getCountdownDays } from '../composables/useCountdown.js'

const emit = defineEmits(['share-countdown'])

const {
  year, month, calendarDays,
  prevMonth, nextMonth, goToday,
  getDayLog, getHeatLevel,
  monthStats, formatDate,
} = useCalendar()

const weekdays = ['日', '一', '二', '三', '四', '五', '六']
const today = computed(() => formatDate(new Date()))
const selectedDate = ref(today.value)

const selectDate = (date) => {
  selectedDate.value = date
}

const { countdowns, addCountdown, deleteCountdown, MAX_COUNT } = useCountdown()
const newCountdownTitle = ref('')
const newCountdownDate = ref('')
const countdownTip = ref('')
let countdownTipTimer = null

const countdownDaysOf = (c) => getCountdownDays(c.date)
const countdownsByDate = computed(() => {
  const map = {}
  for (const c of countdowns.value) {
    (map[c.date] ||= []).push(c)
  }
  return map
})
const countdownsOfDate = (date) => countdownsByDate.value[date] || []
const firstCountdownChar = (date) => {
  const first = countdownsOfDate(date)[0]
  return first ? Array.from(first.title)[0] || '' : ''
}
const countdownTextOf = (c) => {
  const days = countdownDaysOf(c)
  if (days === null) return ''
  if (days > 0) return `还有 ${days} 天`
  if (days === 0) return '就是今天'
  return `已过 ${-days} 天`
}
const sortedCountdowns = computed(() => [...countdowns.value].sort((a, b) => a.date.localeCompare(b.date)))

const handleAddCountdown = () => {
  if (!newCountdownTitle.value.trim() || !newCountdownDate.value) return
  if (addCountdown(newCountdownTitle.value, newCountdownDate.value)) {
    newCountdownTitle.value = ''
    newCountdownDate.value = ''
  } else {
    countdownTip.value = `最多添加 ${MAX_COUNT} 个倒数日`
    clearTimeout(countdownTipTimer)
    countdownTipTimer = setTimeout(() => { countdownTip.value = '' }, 2500)
  }
}

onUnmounted(() => {
  clearTimeout(countdownTipTimer)
})

const formatTime = (seconds) => {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h${m}m`
  return `${m}m`
}
</script>

<style scoped>
.calendar-container {
  color: white;
  padding: 0.5rem 0;
  user-select: none;
}

.month-stats {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.month-stat-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.6rem 0.4rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
}

.month-stat-value {
  font-size: 1rem;
  font-weight: 600;
  color: #4ecdc4;
}

.month-stat-label {
  font-size: 0.7rem;
  opacity: 0.6;
  margin-top: 0.2rem;
}

.calendar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.8rem;
}

.nav-btn {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: white;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.8rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.nav-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.month-title {
  font-size: 0.95rem;
  font-weight: 500;
  cursor: pointer;
  padding: 0.3rem 0.8rem;
  border-radius: 6px;
  transition: background 0.2s ease;
}

.month-title:hover {
  background: rgba(255, 255, 255, 0.1);
}

.weekday-row {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  margin-bottom: 0.3rem;
}

.weekday-cell {
  text-align: center;
  font-size: 0.7rem;
  opacity: 0.5;
  padding: 0.3rem 0;
}

.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
}

.day-cell {
  aspect-ratio: 1;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 0.75rem;
}

.day-number {
  position: absolute;
  top: 3px;
  left: 5px;
  font-weight: 500;
  line-height: 1;
}

.day-info {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  font-size: 0.55rem;
  line-height: 1;
  white-space: nowrap;
}

.day-countdown-badge {
  position: absolute;
  top: 2px;
  right: 4px;
  font-size: 0.58rem;
  line-height: 1;
  color: #ffb8dc;
  background: rgba(255, 138, 196, 0.22);
  border: 1px solid rgba(255, 138, 196, 0.4);
  border-radius: 4px;
  padding: 1.5px 3px;
  pointer-events: none;
}

.day-study-time {
  opacity: 0.85;
}

.day-pomodoro {
  display: inline-flex;
  align-items: center;
  gap: 1px;
  color: #ff8a80;
}

.tomato-icon {
  width: 9px;
  height: 9px;
}

.day-cell:hover {
  background: rgba(255, 255, 255, 0.15);
}

.day-cell.selected {
  background: rgba(255, 255, 255, 0.15);
  border: 2px solid rgba(255, 255, 255, 0.5);
}

.day-cell.other-month {
  opacity: 0.25;
}

.day-cell.today {
  border: 2px solid rgba(78, 205, 196, 0.7);
  box-shadow: 0 0 6px rgba(78, 205, 196, 0.3);
}

/* 热力图颜色 - 高对比度 */
.day-cell.heat-0 { background: rgba(0, 0, 0, 0.2); }
.day-cell.heat-1 { background: rgba(57, 197, 187, 0.25); box-shadow: inset 0 0 0 1px rgba(57, 197, 187, 0.2); }
.day-cell.heat-2 { background: rgba(57, 197, 187, 0.4); box-shadow: inset 0 0 0 1px rgba(57, 197, 187, 0.3); }
.day-cell.heat-3 { background: rgba(46, 204, 113, 0.5); box-shadow: inset 0 0 0 1px rgba(46, 204, 113, 0.4); }
.day-cell.heat-4 { background: rgba(46, 204, 113, 0.7); box-shadow: inset 0 0 0 1px rgba(46, 204, 113, 0.5); color: #fff; }

.heat-legend {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 3px;
  margin-top: 0.5rem;
  padding: 0.3rem 0;
}

.legend-label {
  font-size: 0.65rem;
  opacity: 0.5;
  margin: 0 2px;
}

.legend-block {
  width: 12px;
  height: 12px;
  border-radius: 2px;
}

.legend-block.heat-0 { background: rgba(0, 0, 0, 0.2); border: 1px solid rgba(255,255,255,0.1); }
.legend-block.heat-1 { background: rgba(57, 197, 187, 0.25); }
.legend-block.heat-2 { background: rgba(57, 197, 187, 0.4); }
.legend-block.heat-3 { background: rgba(46, 204, 113, 0.5); }
.legend-block.heat-4 { background: rgba(46, 204, 113, 0.7); }

.countdown-section {
  margin-top: 1rem;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
}
.countdown-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.8rem;
}
.countdown-title {
  font-size: 0.9rem;
  font-weight: 500;
}
.countdown-count {
  font-size: 0.75rem;
  opacity: 0.5;
}
.countdown-input-row {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.6rem;
}
.countdown-input {
  flex: 1;
  min-width: 0;
  padding: 0.5rem 0.8rem;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  color: white;
  font-size: 0.8rem;
  outline: none;
  transition: border-color 0.2s ease;
}
.countdown-input:focus {
  border-color: rgba(78, 205, 196, 0.5);
}
.countdown-input::placeholder {
  color: rgba(255, 255, 255, 0.3);
}
.countdown-date-input {
  flex-shrink: 0;
  padding: 0.4rem 0.5rem;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  color: white;
  font-size: 0.75rem;
  outline: none;
}
.countdown-date-input::-webkit-calendar-picker-indicator {
  filter: invert(1);
  opacity: 0.6;
  cursor: pointer;
}
.add-countdown-btn {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  background: rgba(76, 175, 80, 0.3);
  border: 1px solid rgba(76, 175, 80, 0.5);
  color: white;
  border-radius: 6px;
  cursor: pointer;
  font-size: 1.1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}
.add-countdown-btn:hover {
  background: rgba(76, 175, 80, 0.5);
}
.countdown-tip {
  margin: 0 0 0.5rem 0;
  font-size: 0.75rem;
  color: rgba(255, 193, 7, 0.9);
}
.countdown-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.countdown-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.6rem;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  transition: all 0.2s ease;
}
.countdown-item:hover {
  background: rgba(255, 255, 255, 0.06);
}
.countdown-item.expired {
  opacity: 0.5;
}
.countdown-item-title {
  flex: 1;
  font-size: 0.8rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.countdown-days {
  flex-shrink: 0;
  font-size: 0.75rem;
  color: #4ecdc4;
  white-space: nowrap;
}
.countdown-item.expired .countdown-days {
  color: rgba(255, 255, 255, 0.4);
}
.countdown-share-btn {
  flex-shrink: 0;
  padding: 0.2rem 0.5rem;
  border-radius: 5px;
  font-size: 0.7rem;
  color: rgba(57, 197, 187, 0.9);
  background: rgba(57, 197, 187, 0.12);
  border: 1px solid rgba(57, 197, 187, 0.4);
  cursor: pointer;
  transition: all 0.2s ease;
}
.countdown-share-btn:hover {
  color: #fff;
  background: rgba(57, 197, 187, 0.3);
  border-color: rgba(57, 197, 187, 0.6);
}
.delete-countdown-btn {
  flex-shrink: 0;
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.3);
  cursor: pointer;
  font-size: 1rem;
  padding: 0 4px;
  transition: color 0.2s ease;
}
.delete-countdown-btn:hover {
  color: #ff6b6b;
}
.empty-countdowns {
  text-align: center;
  padding: 0.8rem;
  opacity: 0.4;
  font-size: 0.8rem;
}

@media (max-width: 768px) {
  .month-stats {
    gap: 0.3rem;
  }

  .month-stat-item {
    padding: 0.4rem 0.2rem;
  }

  .month-stat-value {
    font-size: 0.85rem;
  }

  .day-cell {
    font-size: 0.7rem;
  }
}
</style>
