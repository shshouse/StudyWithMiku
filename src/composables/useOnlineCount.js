import { ref, onMounted, onUnmounted, watch, unref } from 'vue'
import { useChatOutbox } from './useChatOutbox.js'

const HISTORY_PAGE_SIZE = 50
const PING_INTERVAL_MS = 25000
const CONNECTION_STALE_MS = 45000
const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 15000

const normalizeChatMessage = (message) => {
  if (!message || typeof message !== 'object') return null

  return {
    id: String(message.id || `${Date.now()}-${Math.random()}`),
    roomId: String(message.roomId || 'global'),
    userId: String(message.userId || ''),
    username: String(message.username || ''),
    content: String(message.content || ''),
    createdAt: String(message.createdAt || new Date().toISOString()),
    location: String(message.location || ''),
  }
}

const sortByCreatedAtAsc = (a, b) => {
  const ta = new Date(a.createdAt).getTime()
  const tb = new Date(b.createdAt).getTime()
  if (ta !== tb) return ta - tb
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

const dedupAndSort = (list) => {
  const map = new Map()
  for (const item of list) {
    if (!item || !item.id) continue
    map.set(item.id, item)
  }
  return Array.from(map.values()).sort(sortByCreatedAtAsc)
}

const getOldestCursor = (list) => {
  if (!list.length) return null
  const ts = new Date(list[0].createdAt).getTime()
  return Number.isFinite(ts) && ts > 0 ? ts : null
}

export function useOnlineCount(wsUrl, options = {}) {
  const onlineCount = ref(0)
  const adminOnline = ref(false)
  const isConnected = ref(false)
  const isAuthenticated = ref(false)
  const messages = ref([])
  const chatError = ref('')
  const hasMoreHistory = ref(false)
  const isLoadingHistory = ref(false)
  let ws = null
  let reconnectTimer = null
  let pingTimer = null
  let pendingLoadCursor = null
  let lastInboundAt = 0
  let reconnectAttempts = 0
  let disposed = false

  const sendMessage = (payload) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload))
      return true
    }
    return false
  }

  const loadMoreMessages = () => {
    if (isLoadingHistory.value) return false
    if (!hasMoreHistory.value) return false
    const cursor = getOldestCursor(messages.value)
    if (!cursor) return false
    const ok = sendMessage({ type: 'load_history', before: cursor, limit: HISTORY_PAGE_SIZE })
    if (ok) {
      isLoadingHistory.value = true
      pendingLoadCursor = cursor
    }
    return ok
  }

  const updateUsername = () => {
    const username = unref(options.username) || ''
    sendMessage({ type: 'username', username })
  }

  const updateAuth = () => {
    const token = unref(options.token) || ''
    if (token) {
      sendMessage({ type: 'auth', token })
      return
    }
    isAuthenticated.value = false
  }

  const appendMessage = (message) => {
    const normalized = normalizeChatMessage(message)
    if (!normalized) return

    const existingIndex = messages.value.findIndex(item => item.id === normalized.id)
    if (existingIndex >= 0) {
      messages.value.splice(existingIndex, 1, normalized)
      return
    }

    messages.value = dedupAndSort([...messages.value, normalized])
  }

  const outbox = useChatOutbox({
    currentUserId: () => String(unref(options.userId) || ''),
    canSend: () => isAuthenticated.value && !!ws && ws.readyState === WebSocket.OPEN,
    send: sendMessage,
  })

  const sendChatMessage = (content, location = '') => outbox.enqueue(content, location)

  const connect = () => {
    try {
      if (disposed) return
      const url = unref(wsUrl)
      if (!url) return

      ws = new WebSocket(url)

      ws.onopen = () => {
        isConnected.value = true
        lastInboundAt = Date.now()
        reconnectAttempts = 0
        console.log('WebSocket connected')
        startPing()
        updateAuth()
        updateUsername()
      }

      ws.onmessage = (event) => {
        lastInboundAt = Date.now()
        try {
          const data = JSON.parse(event.data)
          if (data.type === 'count') {
            onlineCount.value = data.count
            adminOnline.value = !!data.adminOnline
          }
          if (data.type === 'history') {
            const incoming = Array.isArray(data.messages)
              ? data.messages.map(normalizeChatMessage).filter(Boolean)
              : []
            messages.value = dedupAndSort([...incoming, ...messages.value])
            hasMoreHistory.value = !!data.hasMore
            isLoadingHistory.value = false
            pendingLoadCursor = null
          }
          if (data.type === 'history_chunk') {
            const incoming = Array.isArray(data.messages)
              ? data.messages.map(normalizeChatMessage).filter(Boolean)
              : []
            // Prepend older messages, dedup against current list
            messages.value = dedupAndSort([...incoming, ...messages.value])
            hasMoreHistory.value = !!data.hasMore
            isLoadingHistory.value = false
            pendingLoadCursor = null
          }
          if (data.type === 'chat') {
            if (data.message && data.message.clientId) outbox.confirm(data.message.clientId)
            appendMessage(data.message)
          }
          if (data.type === 'chat_ack') {
            const confirmed = outbox.confirm(data.clientId)
            // 广播丢了但服务端确实存下了：用本地副本补一条，避免已发出的消息在聊天记录里消失
            const messageId = data.id || (confirmed && confirmed.clientId)
            if (confirmed && messageId && !messages.value.some(item => item.id === messageId)) {
              appendMessage({
                id: messageId,
                userId: String(unref(options.userId) || ''),
                username: String(unref(options.username) || ''),
                content: confirmed.content,
                location: confirmed.location,
                createdAt: new Date(confirmed.createdAt).toISOString(),
              })
            }
          }
          if (data.type === 'auth') {
            isAuthenticated.value = !!data.ok
            chatError.value = ''
            if (data.ok) outbox.handleReady()
          }
          if (data.type === 'error') {
            const ownedByOutbox = data.clientId && outbox.handleSendError(data.clientId, data.code, data.message)
            if (ownedByOutbox) {
              if (data.code === 'unauthorized') updateAuth()
              if (data.code !== 'rate_limited') chatError.value = data.message || '发送失败'
            } else {
              chatError.value = data.message || '连接异常'
            }
            // Release the loading lock so the user can retry/scroll again
            if (data.code === 'rate_limited' && pendingLoadCursor !== null) {
              isLoadingHistory.value = false
              pendingLoadCursor = null
            }
          }
        } catch (err) {
          console.error('Parse message error:', err)
        }
      }

      ws.onclose = () => {
        isConnected.value = false
        isAuthenticated.value = false
        onlineCount.value = 0
        adminOnline.value = false
        isLoadingHistory.value = false
        pendingLoadCursor = null
        outbox.handleDisconnect()
        console.log('WebSocket disconnected')
        stopPing()
        if (!disposed) scheduleReconnect()
      }

      ws.onerror = (error) => {
        console.error('WebSocket error:', error)
      }
    } catch (err) {
      console.error('WebSocket connection error:', err)
      scheduleReconnect()
    }
  }

  const startPing = () => {
    pingTimer = setInterval(() => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return
      // 长时间收不到任何服务端消息说明连接已经断了，只是本地还显示着 OPEN
      if (Date.now() - lastInboundAt > CONNECTION_STALE_MS) {
        ws.close()
        return
      }
      ws.send(JSON.stringify({ type: 'ping' }))
    }, PING_INTERVAL_MS)
  }

  const stopPing = () => {
    if (pingTimer) {
      clearInterval(pingTimer)
      pingTimer = null
    }
  }

  const scheduleReconnect = () => {
    if (reconnectTimer) return
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** reconnectAttempts, RECONNECT_MAX_MS)
    reconnectAttempts += 1
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connect()
    }, delay)
  }

  const disconnect = () => {
    disposed = true
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    stopPing()
    if (ws) {
      ws.close()
      ws = null
    }
  }

  watch(
    () => unref(options.username),
    () => {
      updateUsername()
    }
  )

  watch(
    () => unref(options.token),
    () => {
      updateAuth()
      updateUsername()
    }
  )

  onMounted(() => {
    connect()
  })

  onUnmounted(() => {
    disconnect()
  })

  return {
    onlineCount,
    adminOnline,
    isConnected,
    isAuthenticated,
    messages,
    chatError,
    hasMoreHistory,
    isLoadingHistory,
    pendingMessages: outbox.pendingMessages,
    sendChatMessage,
    retryMessage: outbox.retry,
    loadMoreMessages,
  }
}
