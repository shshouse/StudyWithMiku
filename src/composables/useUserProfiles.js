import { reactive, unref } from 'vue'

const CACHE_STORAGE_KEY = 'study_user_profiles_cache'
const CACHE_TTL_MS = 6 * 60 * 60 * 1000
const NEGATIVE_TTL_MS = 10 * 60 * 1000
const BATCH_FLUSH_DELAY_MS = 150
const BATCH_LIMIT = 50
const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

const MIKUMOD_URL = import.meta.env.VITE_MIKUMOD_URL || 'https://mikumod.com'

const profiles = reactive({})
const expiresAtMap = new Map()
const pendingIds = new Set()
const inflightIds = new Set()
let flushTimer = null
let storageLoaded = false

const loadFromStorage = () => {
  if (storageLoaded) return
  storageLoaded = true
  try {
    const raw = localStorage.getItem(CACHE_STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return
    const now = Date.now()
    for (const [id, entry] of Object.entries(parsed)) {
      if (!entry || typeof entry !== 'object') continue
      const expiresAt = Number(entry.expiresAt) || 0
      if (expiresAt <= now) continue
      profiles[id] = entry.profile || null
      expiresAtMap.set(id, expiresAt)
    }
  } catch (e) {
    console.warn('读取用户信息缓存失败', e)
  }
}

const persistToStorage = () => {
  try {
    const payload = {}
    for (const [id, expiresAt] of expiresAtMap) {
      payload[id] = { profile: profiles[id] ?? null, expiresAt }
    }
    localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(payload))
  } catch (e) {
    console.warn('写入用户信息缓存失败', e)
  }
}

const setProfile = (id, profile, ttlMs) => {
  profiles[id] = profile
  expiresAtMap.set(id, Date.now() + ttlMs)
}

const isFresh = (id) => {
  const expiresAt = expiresAtMap.get(id)
  return typeof expiresAt === 'number' && expiresAt > Date.now()
}

const fetchBatch = async (ids, token) => {
  if (!ids.length || !token) return
  try {
    const url = `${MIKUMOD_URL}/api/study/profiles?ids=${ids.map(encodeURIComponent).join(',')}`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'omit',
    })
    if (!res.ok) {
      for (const id of ids) setProfile(id, null, NEGATIVE_TTL_MS)
      persistToStorage()
      return
    }
    const data = await res.json().catch(() => ({}))
    const received = (data && typeof data.profiles === 'object' && data.profiles) || {}
    for (const id of ids) {
      const profile = received[id]
      if (profile && (profile.username || profile.avatar_url)) {
        setProfile(id, { username: profile.username || null, avatar_url: profile.avatar_url || null }, CACHE_TTL_MS)
      } else {
        setProfile(id, null, NEGATIVE_TTL_MS)
      }
    }
    persistToStorage()
  } catch (e) {
    console.warn('拉取用户信息失败', e)
    for (const id of ids) setProfile(id, null, NEGATIVE_TTL_MS)
    persistToStorage()
  } finally {
    for (const id of ids) inflightIds.delete(id)
  }
}

const scheduleFlush = (token) => {
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    if (!pendingIds.size) return
    const tokenValue = typeof token === 'function' ? token() : unref(token)
    if (!tokenValue) return
    const ids = Array.from(pendingIds).slice(0, BATCH_LIMIT)
    for (const id of ids) {
      pendingIds.delete(id)
      inflightIds.add(id)
    }
    fetchBatch(ids, tokenValue)
    if (pendingIds.size > 0) scheduleFlush(token)
  }, BATCH_FLUSH_DELAY_MS)
}

export function useUserProfiles(token) {
  loadFromStorage()

  const ensureProfiles = (userIds) => {
    if (!Array.isArray(userIds) || userIds.length === 0) return
    let added = false
    for (const id of userIds) {
      if (!id || typeof id !== 'string') continue
      if (!UUID_PATTERN.test(id)) continue
      if (isFresh(id)) continue
      if (inflightIds.has(id)) continue
      if (pendingIds.has(id)) continue
      pendingIds.add(id)
      added = true
    }
    if (added) scheduleFlush(token)
  }

  return { profiles, ensureProfiles }
}
