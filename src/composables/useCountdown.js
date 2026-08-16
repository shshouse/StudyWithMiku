import { ref } from 'vue'

const COUNTDOWN_KEY = 'study_countdowns'
const MAX_COUNT = 20

const load = () => {
  try {
    const saved = localStorage.getItem(COUNTDOWN_KEY)
    const list = saved ? JSON.parse(saved) : []
    return Array.isArray(list) ? list.filter(c => c && c.id && c.title && c.date).slice(0, MAX_COUNT) : []
  } catch { return [] }
}

const countdowns = ref(load())

const persist = () => {
  try { localStorage.setItem(COUNTDOWN_KEY, JSON.stringify(countdowns.value)) } catch {}
}

export const getCountdownDays = (dateStr) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr))) return null
  const [y, m, d] = dateStr.split('-').map(Number)
  const target = new Date(y, m - 1, d)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((target - today) / 86400000)
}

export function useCountdown() {
  const addCountdown = (title, date) => {
    if (!title.trim() || !date) return false
    if (countdowns.value.length >= MAX_COUNT) return false
    countdowns.value.push({ id: Date.now(), title: title.trim(), date })
    persist()
    return true
  }

  const deleteCountdown = (id) => {
    countdowns.value = countdowns.value.filter(c => c.id !== id)
    persist()
  }

  const setCountdowns = (list) => {
    if (!Array.isArray(list)) return
    countdowns.value = list.filter(c => c && c.id && c.title && c.date).slice(0, MAX_COUNT)
    persist()
  }

  return { countdowns, addCountdown, deleteCountdown, setCountdowns, MAX_COUNT }
}
