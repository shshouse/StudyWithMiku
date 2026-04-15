export class OnlineCounter {
  constructor(state, env) {
    this.state = state
    this.env = env
  }

  getSessionMeta(ws) {
    try {
      return ws.deserializeAttachment() || { username: '' }
    } catch {
      return { username: '' }
    }
  }

  setSessionMeta(ws, username = '') {
    ws.serializeAttachment({ username })
  }

  async fetch(request) {
    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)

    this.state.acceptWebSocket(server)
    this.setSessionMeta(server)
    this.broadcast()

    return new Response(null, {
      status: 101,
      webSocket: client,
    })
  }

  async webSocketMessage(ws, message) {
    try {
      const data = JSON.parse(message)
      if (data.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }))
        return
      }

      if (data.type === 'username') {
        this.setSessionMeta(ws, data.username || '')
        this.broadcast()
      }
    } catch (err) {
      console.error('Parse error:', err)
    }
  }

  async webSocketClose(ws, code, reason, wasClean) {
    ws.close(1000, 'Goodbye')
    this.broadcast()
  }

  async webSocketError(ws, error) {
    this.broadcast()
  }

  broadcast() {
    const sessions = this.state.getWebSockets()
    const count = sessions.length
    const isAdminOnline = sessions.some(session => {
      const meta = this.getSessionMeta(session)
      return meta.username === 'shshouse'
    })

    const message = JSON.stringify({ 
      type: 'count', 
      count,
      adminOnline: isAdminOnline 
    })
    
    for (const session of sessions) {
      try {
        session.send(message)
      } catch (err) {
      }
    }
  }
}

const getAllowedOrigins = () => {
  return [
    'https://study.mikugame.icu',
    'https://study.mikumod.com',
  ]
}

const isOriginAllowed = (origin) => {
  return getAllowedOrigins().includes(origin)
}

const getCorsHeaders = (origin) => {
  if (isOriginAllowed(origin)) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    }
  }
  return {}
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const origin = request.headers.get('Origin')

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: getCorsHeaders(origin),
      })
    }

    if (url.pathname === '/ws') {
      if (!isOriginAllowed(origin)) {
        return new Response('Forbidden', { status: 403 })
      }

      const upgradeHeader = request.headers.get('Upgrade')
      if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
        return new Response('Expected WebSocket', { status: 426 })
      }
      
      const id = env.ONLINE_COUNTER.idFromName('global')
      const stub = env.ONLINE_COUNTER.get(id)
      return stub.fetch(request)
    }

    if (url.pathname === '/count') {
      if (!isOriginAllowed(origin)) {
        return new Response('Forbidden', { status: 403 })
      }

      return new Response(JSON.stringify({ count: 0 }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(origin),
        },
      })
    }

    return new Response('OK', { status: 200 })
  },
}
