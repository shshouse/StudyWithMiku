import { ref, onMounted, onUnmounted, watch, unref } from 'vue'

const MAX_LOCAL_MESSAGES = 100

const normalizeChatMessage = (message) => {
  if (!message || typeof message !== 'object') return null

  return {
    id: String(message.id || `${Date.now()}-${Math.random()}`),
    roomId: String(message.roomId || 'global'),
    userId: String(message.userId || ''),
    username: String(message.username || ''),
    content: String(message.content || ''),
    createdAt: String(message.createdAt || new Date().toISOString()),
  }
}

export function useOnlineCount(wsUrl, options = {}) {
  const onlineCount = ref(0)
  const adminOnline = ref(false)
  const isConnected = ref(false)
  const isAuthenticated = ref(false)
  const messages = ref([])
  const chatError = ref('')
  let ws = null
  let reconnectTimer = null
  let pingTimer = null

  const sendMessage = (payload) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload))
      return true
    }
    return false
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

    messages.value = [...messages.value, normalized].slice(-MAX_LOCAL_MESSAGES)
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
            messages.value = Array.isArray(data.messages)
              ? data.messages.map(normalizeChatMessage).filter(Boolean)
              : []
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
    sendChatMessage,
  }
}
