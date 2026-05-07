import { ref, onMounted, onUnmounted, watch, unref } from 'vue'

const HISTORY_PAGE_SIZE = 50

const normalizeChatMessage = (message) => {
  if (!message || typeof message !== 'object') return null

  return {
    id: String(message.id || `${Date.now()}-${Math.random()}`),
    roomId: String(message.roomId || 'global'),
    userId: String(message.userId || ''),
    username: String(message.username || ''),
    avatarUrl: typeof message.avatarUrl === 'string' ? message.avatarUrl : '',
    content: String(message.content || ''),
    createdAt: String(message.createdAt || new Date().toISOString()),
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

  const sendChatMessage = (content) => {
    const normalized = String(content || '').trim()
    if (!normalized) return false
    chatError.value = ''
    return sendMessage({ type: 'chat', content: normalized })
  }

  const connect = () => {
    try {
      const url = unref(wsUrl)
      if (!url) return

      ws = new WebSocket(url)

      ws.onopen = () => {
        isConnected.value = true
        console.log('WebSocket connected')
        startPing()
        updateAuth()
        updateUsername()
      }

      ws.onmessage = (event) => {
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
            messages.value = dedupAndSort(incoming)
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
            appendMessage(data.message)
          }
          if (data.type === 'auth') {
            isAuthenticated.value = !!data.ok
            chatError.value = ''
          }
          if (data.type === 'error') {
            chatError.value = data.message || '连接异常'
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
        console.log('WebSocket disconnected')
        stopPing()
        scheduleReconnect()
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
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }))
      }
    }, 30000)
  }

  const stopPing = () => {
    if (pingTimer) {
      clearInterval(pingTimer)
      pingTimer = null
    }
  }

  const scheduleReconnect = () => {
    if (reconnectTimer) return
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connect()
    }, 3000)
  }

  const disconnect = () => {
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
    sendChatMessage,
    loadMoreMessages,
  }
}
