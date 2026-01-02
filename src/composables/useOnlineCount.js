import { ref, onMounted, onUnmounted } from 'vue'

export function useOnlineCount(sseUrl) {
  const onlineCount = ref(0)
  const isConnected = ref(false)
  let eventSource = null

  const connect = () => {
    try {
      eventSource = new EventSource(sseUrl)

      eventSource.onopen = () => {
        isConnected.value = true
        console.log('SSE connected')
      }

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type === 'count') {
            onlineCount.value = data.count
          }
        } catch (err) {
          console.error('Parse message error:', err)
        }
      }

      eventSource.onerror = (error) => {
        console.error('SSE error:', error)
        isConnected.value = false
        eventSource.close()
        eventSource = null
      }
    } catch (err) {
      console.error('SSE connection error:', err)
    }
  }

  const disconnect = () => {
    if (eventSource) {
      eventSource.close()
      eventSource = null
    }
    isConnected.value = false
  }

  onMounted(() => {
    connect()
  })

  onUnmounted(() => {
    disconnect()
  })

  return {
    onlineCount,
    isConnected,
  }
}
