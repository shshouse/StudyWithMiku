import { computed, ref } from 'vue'

// 发出前先写入本地队列，收到服务端确认后才移除。刷新、断线、重连都不会丢。
// 每条消息带一个本地生成的 clientId，服务端用它去重，重复补发不会产生两条。

const STORAGE_KEY = 'chat_outbox_v1'
const ACK_TIMEOUT_MS = 10000
const MAX_ATTEMPTS = 3
const SEND_PACE_MS = 1600
const RETRY_DELAY_MS = 2000
const AUTO_RESEND_WINDOW_MS = 24 * 60 * 60 * 1000

const createClientId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `c-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

const loadEntries = () => {
  let stored
  try {
    stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch {
    return []
  }
  if (!Array.isArray(stored)) return []
  return stored
    .filter(item => item && typeof item.clientId === 'string' && typeof item.content === 'string' && !item.failed)
    .map(item => ({
      clientId: item.clientId,
      userId: String(item.userId || ''),
      content: String(item.content || ''),
      location: String(item.location || ''),
      createdAt: Number(item.createdAt) || Date.now(),
      attempts: Number(item.attempts) || 0,
    }))
}

export function useChatOutbox({ currentUserId, canSend, canRetry = () => true, send }) {
  const entries = ref(loadEntries())
  const failedDrafts = ref([])
  const inFlightId = ref('')

  let ackTimer = null
  let flushTimer = null

  const persist = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.value))
    } catch {
    }
  }

  const findEntry = clientId => entries.value.find(item => item.clientId === clientId)

  const clearAckTimer = () => {
    if (ackTimer) {
      clearTimeout(ackTimer)
      ackTimer = null
    }
  }

  const scheduleFlush = (delay = 0) => {
    if (flushTimer) clearTimeout(flushTimer)
    flushTimer = setTimeout(() => {
      flushTimer = null
      flush()
    }, delay)
  }

  const failEntry = (entry, message) => {
    entries.value = entries.value.filter(item => item.clientId !== entry.clientId)
    persist()
    failedDrafts.value = [...failedDrafts.value, {
      clientId: entry.clientId,
      content: entry.content,
      location: entry.location,
      error: message,
    }]
  }

  const dismissFailed = (clientId) => {
    failedDrafts.value = failedDrafts.value.filter(item => item.clientId !== clientId)
  }

  const pendingMessages = computed(() => {
    const userId = currentUserId()
    return entries.value
      .filter(item => item.userId === userId)
      .map(item => ({
        clientId: item.clientId,
        content: item.content,
        location: item.location,
        createdAt: item.createdAt,
        status: item.clientId === inFlightId.value ? 'sending' : 'pending',
      }))
  })

  function flush() {
    if (inFlightId.value || !canSend()) return
    const userId = currentUserId()
    if (!userId) return
    const entry = entries.value.find(item => item.userId === userId)
    if (!entry) return

    inFlightId.value = entry.clientId
    entry.attempts += 1
    persist()

    const sent = send({
      type: 'chat',
      clientId: entry.clientId,
      content: entry.content,
      location: entry.location,
    })
    if (!sent) {
      inFlightId.value = ''
      return
    }

    // 服务端不会回 ack 时就不能重发：没有去重的重发等于复制消息
    if (!canRetry()) {
      entries.value = entries.value.filter(item => item.clientId !== entry.clientId)
      inFlightId.value = ''
      persist()
      scheduleFlush(SEND_PACE_MS)
      return
    }

    clearAckTimer()
    ackTimer = setTimeout(() => {
      ackTimer = null
      if (inFlightId.value !== entry.clientId) return
      inFlightId.value = ''
      if (!canSend()) return
      if (entry.attempts >= MAX_ATTEMPTS) failEntry(entry, '发送超时，请重试')
      else flush()
    }, ACK_TIMEOUT_MS)
  }

  const confirm = (clientId) => {
    if (!clientId) return null
    clearAckTimer()
    if (inFlightId.value === clientId) inFlightId.value = ''
    const entry = entries.value.find(item => item.clientId === clientId)
    if (!entry) return null
    entries.value = entries.value.filter(item => item.clientId !== clientId)
    persist()
    scheduleFlush(SEND_PACE_MS)
    return entry
  }

  const handleSendError = (clientId, code, message) => {
    if (!clientId) return false
    const entry = findEntry(clientId)
    if (!entry) return false

    clearAckTimer()
    if (inFlightId.value === clientId) inFlightId.value = ''

    if (code === 'rate_limited') {
      scheduleFlush(SEND_PACE_MS)
      return true
    }

    if (code === 'unauthorized') {
      failEntry(entry, message || '请重新登录后发送')
      return true
    }

    const retryable = code === 'persistence_failed' || code === 'server_misconfigured'
    if (retryable && entry.attempts < MAX_ATTEMPTS) {
      scheduleFlush(RETRY_DELAY_MS)
      return true
    }

    failEntry(entry, message || '发送失败，请重试')
    return true
  }

  const enqueue = (content, location = '') => {
    const text = String(content || '').trim()
    const userId = currentUserId()
    if (!text || !userId) return false

    entries.value = [...entries.value, {
      clientId: createClientId(),
      userId,
      content: text,
      location: String(location || ''),
      createdAt: Date.now(),
      attempts: 0,
    }]
    persist()
    flush()
    return true
  }

  const handleReady = () => {
    const now = Date.now()
    const stale = entries.value.filter(item => now - item.createdAt > AUTO_RESEND_WINDOW_MS)
    for (const entry of stale) failEntry(entry, '超过 24 小时未发送')
    flush()
  }

  const handleDisconnect = () => {
    clearAckTimer()
    inFlightId.value = ''
  }

  return {
    pendingMessages,
    failedDrafts,
    enqueue,
    confirm,
    dismissFailed,
    handleSendError,
    handleReady,
    handleDisconnect,
  }
}
