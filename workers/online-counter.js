export class OnlineCounter {
  constructor(state, env) {
    this.state = state
    this.env = env
    this.clients = new Map()
  }

  async fetch(request) {
    const url = new URL(request.url)
    const clientId = crypto.randomUUID()

    const stream = new ReadableStream({
      start: (controller) => {
        this.clients.set(clientId, controller)
        this.broadcast()

        const encoder = new TextEncoder()

        const sendEvent = (data) => {
          try {
            controller.enqueue(encoder.encode(`data: ${data}\n\n`))
          } catch (err) {
            this.clients.delete(clientId)
          }
        }

        const heartbeatInterval = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(': heartbeat\n\n'))
          } catch (err) {
            clearInterval(heartbeatInterval)
            this.clients.delete(clientId)
          }
        }, 30000)

        request.signal.addEventListener('abort', () => {
          clearInterval(heartbeatInterval)
          this.clients.delete(clientId)
          this.broadcast()
        })
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }

  broadcast() {
    const count = this.clients.size
    const message = JSON.stringify({ type: 'count', count })

    for (const [clientId, controller] of this.clients) {
      try {
        const encoder = new TextEncoder()
        controller.enqueue(encoder.encode(`data: ${message}\n\n`))
      } catch (err) {
        this.clients.delete(clientId)
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

    if (url.pathname === '/sse') {
      if (!isOriginAllowed(origin)) {
        return new Response('Forbidden', { status: 403 })
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
