import { ref, computed } from 'vue'

const CALENDAR_KEY = 'study_calendar'
const DAILY_LOG_KEY = 'study_daily_log'

const formatDate = (date) => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const getToday = () => formatDate(new Date())

// 每日学习记录 { '2026-03-27': { studyTime: 3600, pomodoros: 4 } }
const loadDailyLog = () => {
  try {
    const saved = localStorage.getItem(DAILY_LOG_KEY)
    return saved ? JSON.parse(saved) : {}
  } catch { return {} }
}

const saveDailyLog = (log) => {
  localStorage.setItem(DAILY_LOG_KEY, JSON.stringify(log))
}

// 学习计划 { '2026-03-27': [{ id, text, done, color }] }
const loadPlans = () => {
  try {
    const saved = localStorage.getItem(CALENDAR_KEY)
    return saved ? JSON.parse(saved) : {}
  } catch { return {} }
}

const savePlans = (plans) => {
  localStorage.setItem(CALENDAR_KEY, JSON.stringify(plans))
}

const dailyLog = ref(loadDailyLog())
const plans = ref(loadPlans())

export function useCalendar() {
  const currentMonth = ref(new Date())

  const year = computed(() => currentMonth.value.getFullYear())
  const month = computed(() => currentMonth.value.getMonth())

  const prevMonth = () => {
    const d = new Date(currentMonth.value)
    d.setMonth(d.getMonth() - 1)
    currentMonth.value = d
  }

  const nextMonth = () => {
    const d = new Date(currentMonth.value)
    d.setMonth(d.getMonth() + 1)
    currentMonth.value = d
  }

  const goToday = () => {
    currentMonth.value = new Date()
  }

  // 生成日历网格（包含上月尾/下月头的填充日）
  const calendarDays = computed(() => {
    const y = year.value
    const m = month.value
    const firstDay = new Date(y, m, 1).getDay() // 0=周日
    const daysInMonth = new Date(y, m + 1, 0).getDate()
    const daysInPrevMonth = new Date(y, m, 0).getDate()

    const days = []

    // 上月填充
    for (let i = firstDay - 1; i >= 0; i--) {
      const day = daysInPrevMonth - i
      const date = formatDate(new Date(y, m - 1, day))
      days.push({ day, date, isCurrentMonth: false })
    }

    // 当月
    for (let d = 1; d <= daysInMonth; d++) {
      const date = formatDate(new Date(y, m, d))
      days.push({ day: d, date, isCurrentMonth: true })
    }

    // 下月填充到42格（6行）
    const remaining = 42 - days.length
    for (let d = 1; d <= remaining; d++) {
      const date = formatDate(new Date(y, m + 1, d))
      days.push({ day: d, date, isCurrentMonth: false })
    }

    return days
  })

  const getDayLog = (dateStr) => dailyLog.value[dateStr] || { studyTime: 0, pomodoros: 0 }
  const getDayPlans = (dateStr) => plans.value[dateStr] || []

  // 热力图等级 0-4，基于当天学习时间
  const getHeatLevel = (dateStr) => {
    const log = getDayLog(dateStr)
    const time = log.studyTime || 0
    if (time === 0) return 0
    if (time < 3600) return 1
    if (time < 7200) return 2
    if (time < 14400) return 3
    return 4
  }

  // 记录当日学习（由外部 addStudyTime/addPomodoro 调用）
  const recordStudyTime = (seconds) => {
    const today = getToday()
    if (!dailyLog.value[today]) {
      dailyLog.value[today] = { studyTime: 0, pomodoros: 0 }
    }
    dailyLog.value[today].studyTime += seconds
    saveDailyLog(dailyLog.value)
  }

  const recordPomodoro = () => {
    const today = getToday()
    if (!dailyLog.value[today]) {
      dailyLog.value[today] = { studyTime: 0, pomodoros: 0 }
    }
    dailyLog.value[today].pomodoros += 1
    saveDailyLog(dailyLog.value)
  }

  // 计划 CRUD
  const PLAN_COLORS = [
    { value: 'default', label: '默认', color: 'rgba(255,255,255,0.6)' },
    { value: 'red', label: '重要', color: '#ff6b6b' },
    { value: 'green', label: '轻松', color: '#4ecdc4' },
    { value: 'blue', label: '阅读', color: '#45b7d1' },
    { value: 'yellow', label: '复习', color: '#ffc107' },
    { value: 'purple', label: '练习', color: '#a29bfe' },
  ]

  const addPlan = (dateStr, text, color = 'default') => {
    if (!text.trim()) return
    if (!plans.value[dateStr]) plans.value[dateStr] = []
    plans.value[dateStr].push({
      id: Date.now(),
      text: text.trim(),
      done: false,
      color,
    })
    savePlans(plans.value)
  }

  const togglePlan = (dateStr, planId) => {
    const list = plans.value[dateStr]
    if (!list) return
    const plan = list.find(p => p.id === planId)
    if (plan) {
      plan.done = !plan.done
      savePlans(plans.value)
    }
  }

  const deletePlan = (dateStr, planId) => {
    if (!plans.value[dateStr]) return
    plans.value[dateStr] = plans.value[dateStr].filter(p => p.id !== planId)
    if (plans.value[dateStr].length === 0) delete plans.value[dateStr]
    savePlans(plans.value)
  }

  // 获取月度统计
  const monthStats = computed(() => {
    const y = year.value
    const m = month.value
    const daysInMonth = new Date(y, m + 1, 0).getDate()
    let totalTime = 0
    let totalPomodoros = 0
    let activeDays = 0

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = formatDate(new Date(y, m, d))
      const log = dailyLog.value[dateStr]
      if (log && log.studyTime > 0) {
        totalTime += log.studyTime
        totalPomodoros += log.pomodoros || 0
        activeDays++
      }
    }

    return { totalTime, totalPomodoros, activeDays }
  })

  // 导出给同步用
  const getCalendarData = () => ({
    dailyLog: dailyLog.value,
    plans: plans.value,
  })

  const setCalendarData = (data) => {
    if (data.dailyLog) {
      dailyLog.value = data.dailyLog
      saveDailyLog(data.dailyLog)
    }
    if (data.plans) {
      plans.value = data.plans
      savePlans(data.plans)
    }
  }

  return {
    currentMonth,
    year,
    month,
    calendarDays,
    prevMonth,
    nextMonth,
    goToday,
    getDayLog,
    getDayPlans,
    getHeatLevel,
    recordStudyTime,
    recordPomodoro,
    PLAN_COLORS,
    addPlan,
    togglePlan,
    deletePlan,
    monthStats,
    formatDate,
    getCalendarData,
    setCalendarData,
    dailyLog,
    plans,
  }
}
