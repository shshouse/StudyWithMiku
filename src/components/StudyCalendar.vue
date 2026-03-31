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
        <div class="day-content">
          <span class="day-number">{{ d.day }}</span>
          <span v-if="getDayLog(d.date).studyTime >= 60" class="day-study-time">
            {{ formatTime(getDayLog(d.date).studyTime) }}
          </span>
        </div>
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

    <!-- 选中日期详情 -->
    <transition name="slide-up">
      <div v-if="selectedDate" class="day-detail">
        <div class="detail-header">
          <span class="detail-date">{{ formatSelectedDate }}</span>
          <div class="detail-stats" v-if="selectedLog.studyTime > 0 || selectedLog.pomodoros > 0">
            <span class="detail-stat">{{ formatTime(selectedLog.studyTime) }}</span>
            <span class="detail-stat">{{ selectedLog.pomodoros }}个番茄</span>
          </div>
        </div>

        <!-- 添加计划 -->
        <div class="plan-input-row">
          <input
            type="text"
            v-model="newPlanText"
            @keyup.enter="handleAddPlan"
            placeholder="添加学习计划..."
            class="plan-input"
          />
          <select v-model="newPlanColor" class="color-select">
            <option v-for="c in PLAN_COLORS" :key="c.value" :value="c.value">{{ c.label }}</option>
          </select>
          <button class="add-plan-btn" @click="handleAddPlan">+</button>
        </div>

        <!-- 计划列表 -->
        <div class="plan-list" v-if="selectedPlans.length > 0">
          <div
            v-for="plan in selectedPlans"
            :key="plan.id"
            class="plan-item"
            :class="{ done: plan.done }"
          >
            <input type="checkbox" :checked="plan.done" @change="togglePlan(selectedDate, plan.id)" class="plan-checkbox" />
            <span class="plan-color-dot" :style="{ background: getColorValue(plan.color) }"></span>
            <span class="plan-text">{{ plan.text }}</span>
            <button class="delete-plan-btn" @click="deletePlan(selectedDate, plan.id)">&times;</button>
          </div>
        </div>
        <div v-else class="empty-plans">暂无学习计划</div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useCalendar } from '../composables/useCalendar.js'

const {
  year, month, calendarDays,
  prevMonth, nextMonth, goToday,
  getDayLog, getDayPlans, getHeatLevel,
  PLAN_COLORS, addPlan, togglePlan, deletePlan,
  monthStats, formatDate,
} = useCalendar()

const weekdays = ['日', '一', '二', '三', '四', '五', '六']
const today = computed(() => formatDate(new Date()))
const selectedDate = ref(today.value)
const newPlanText = ref('')
const newPlanColor = ref('default')

const selectedLog = computed(() => getDayLog(selectedDate.value))
const selectedPlans = computed(() => getDayPlans(selectedDate.value))

const formatSelectedDate = computed(() => {
  const [y, m, d] = selectedDate.value.split('-')
  return `${parseInt(m)}月${parseInt(d)}日`
})

const selectDate = (date) => {
  selectedDate.value = date
}

const handleAddPlan = () => {
  if (!newPlanText.value.trim()) return
  addPlan(selectedDate.value, newPlanText.value, newPlanColor.value)
  newPlanText.value = ''
}

const getColorValue = (colorKey) => {
  const c = PLAN_COLORS.find(p => p.value === colorKey)
  return c ? c.color : 'rgba(255,255,255,0.6)'
}

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
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  font-size: 0.75rem;
}

.day-content {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.day-study-time {
  font-size: 0.55rem;
  opacity: 0.85;
  margin-top: 2px;
  white-space: nowrap;
}

.day-cell:hover {
  background: rgba(255, 255, 255, 0.15);
}

.day-cell.other-month {
  opacity: 0.25;
}

.day-cell.today {
  border: 2px solid rgba(78, 205, 196, 0.7);
  box-shadow: 0 0 6px rgba(78, 205, 196, 0.3);
}

.day-cell.selected {
  background: rgba(255, 255, 255, 0.15);
  border: 2px solid rgba(255, 255, 255, 0.5);
}

/* 热力图颜色 - 高对比度 */
.day-cell.heat-0 { background: rgba(0, 0, 0, 0.2); }
.day-cell.heat-1 { background: rgba(57, 197, 187, 0.25); box-shadow: inset 0 0 0 1px rgba(57, 197, 187, 0.2); }
.day-cell.heat-2 { background: rgba(57, 197, 187, 0.4); box-shadow: inset 0 0 0 1px rgba(57, 197, 187, 0.3); }
.day-cell.heat-3 { background: rgba(46, 204, 113, 0.5); box-shadow: inset 0 0 0 1px rgba(46, 204, 113, 0.4); }
.day-cell.heat-4 { background: rgba(46, 204, 113, 0.7); box-shadow: inset 0 0 0 1px rgba(46, 204, 113, 0.5); color: #fff; }

.day-number {
  font-weight: 500;
  line-height: 1;
}

.day-indicators {
  display: flex;
  gap: 1px;
  height: 10px;
  position: absolute;
  bottom: 2px;
}

.indicator {
  font-size: 0.5rem;
  padding: 0 2px;
  border-radius: 3px;
  line-height: 10px;
}

.pomodoro-indicator {
  background: rgba(255, 107, 107, 0.5);
  color: #ff6b6b;
}

.plan-indicator {
  background: rgba(162, 155, 254, 0.5);
  color: #a29bfe;
}

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

/* 日期详情 */
.day-detail {
  margin-top: 1rem;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.8rem;
}

.detail-date {
  font-size: 0.95rem;
  font-weight: 500;
}

.detail-stats {
  display: flex;
  gap: 0.8rem;
}

.detail-stat {
  font-size: 0.75rem;
  padding: 0.2rem 0.5rem;
  background: rgba(78, 205, 196, 0.15);
  border-radius: 10px;
  color: #4ecdc4;
}

.plan-input-row {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.8rem;
}

.plan-input {
  flex: 1;
  padding: 0.5rem 0.8rem;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  color: white;
  font-size: 0.8rem;
  outline: none;
  transition: border-color 0.2s ease;
}

.plan-input:focus {
  border-color: rgba(78, 205, 196, 0.5);
}

.plan-input::placeholder {
  color: rgba(255, 255, 255, 0.3);
}

.color-select {
  padding: 0.5rem;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  color: white;
  font-size: 0.75rem;
  cursor: pointer;
  outline: none;
}

.color-select option {
  background: #2c3e50;
  color: white;
}

.add-plan-btn {
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
  flex-shrink: 0;
}

.add-plan-btn:hover {
  background: rgba(76, 175, 80, 0.5);
}

.plan-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.plan-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.6rem;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  transition: all 0.2s ease;
}

.plan-item:hover {
  background: rgba(255, 255, 255, 0.06);
}

.plan-item.done {
  opacity: 0.5;
}

.plan-item.done .plan-text {
  text-decoration: line-through;
}

.plan-checkbox {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: #4ecdc4;
  flex-shrink: 0;
}

.plan-color-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.plan-text {
  flex: 1;
  font-size: 0.8rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.delete-plan-btn {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.3);
  cursor: pointer;
  font-size: 1rem;
  padding: 0 4px;
  transition: color 0.2s ease;
  flex-shrink: 0;
}

.delete-plan-btn:hover {
  color: #ff6b6b;
}

.empty-plans {
  text-align: center;
  padding: 1rem;
  opacity: 0.4;
  font-size: 0.8rem;
}

.slide-up-enter-active {
  transition: all 0.3s ease;
}

.slide-up-leave-active {
  transition: all 0.2s ease;
}

.slide-up-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.slide-up-leave-to {
  opacity: 0;
  transform: translateY(10px);
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

  .plan-input-row {
    flex-wrap: wrap;
  }

  .plan-input {
    min-width: 0;
  }
}
</style>
