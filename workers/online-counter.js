const DEFAULT_ROOM_ID = 'global'
const MAX_ROOM_ID_LENGTH = 64
const MAX_USERNAME_LENGTH = 40
const MAX_MESSAGE_LENGTH = 500
const MAX_HISTORY_LIMIT = 50
const CHAT_THROTTLE_MS = 1500

const getDefaultSessionMeta = () => ({
  roomId: DEFAULT_ROOM_ID,
  userId: '',
  username: '',
  authenticated: false,
  lastMessageAt: 0,
})

const normalizeRoomId = (value) => {
  const raw = String(value || DEFAULT_ROOM_ID).trim().toLowerCase()
  const normalized = raw
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_ROOM_ID_LENGTH)

  return normalized || DEFAULT_ROOM_ID
}

const getRoomIdFromUrl = (url) => normalizeRoomId(url.searchParams.get('roomId') || url.searchParams.get('room'))

const sanitizeUsername = (value) => String(value || '').trim().slice(0, MAX_USERNAME_LENGTH)

const sanitizeContent = (value) => String(value || '').trim().slice(0, MAX_MESSAGE_LENGTH)

const jsonResponse = (data, init = {}) => {
  const headers = new Headers(init.headers || {})
  headers.set('Content-Type', 'application/json; charset=utf-8')
  return new Response(JSON.stringify(data), {
    ...init,
    headers,
  })
}

const base64UrlDecode = (value) => {
  let normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  normalized += '='.repeat((4 - normalized.length % 4) % 4)
  const binary = atob(normalized)
  const bytes = new Uint8Array(binary.length)

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }

  return bytes
}

const getBearerToken = (request) => {
  const authorization = request.headers.get('Authorization') || ''
  if (authorization.startsWith('Bearer ')) {
    return authorization.slice(7).trim()
  }

  const url = new URL(request.url)
  return (url.searchParams.get('token') || '').trim()
}

const verifyStudyToken = async (token, env) => {
  try {
    if (!token || !env.STUDY_JWT_SECRET) return null

    const parts = token.split('.')
    if (parts.length !== 3) return null

    const [headerB64, payloadB64, signatureB64] = parts
    const signingInput = `${headerB64}.${payloadB64}`
    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(env.STUDY_JWT_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    )
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      base64UrlDecode(signatureB64),
      encoder.encode(signingInput)
    )

    if (!valid) return null

    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64)))
    const now = Math.floor(Date.now() / 1000)
    const minIat = Number.parseInt(env.STUDY_JWT_MIN_IAT || '0', 10) || 0

    if (typeof payload.sub !== 'string' || payload.sub.length === 0) return null
    if (payload.iss !== 'mikumod') return null
    if (payload.aud !== 'study') return null
    if (typeof payload.iat !== 'number') return null
    if (minIat > 0 && payload.iat < minIat) return null
    if (payload.exp && payload.exp < now) return null

    return {
      userId: payload.sub,
      username: sanitizeUsername(payload.username || payload.sub.slice(0, 8)),
    }
  } catch {
    return null
  }
}

const getAllowedOrigins = (env) => {
  const configured = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)

  return Array.from(new Set([
    'https://study.mikugame.icu',
    'https://study.mikumod.com',
    ...configured,
  ]))
}

const isOriginAllowed = (origin, env) => !!origin && getAllowedOrigins(env).includes(origin)

const getCorsHeaders = (origin, env) => {
  if (!isOriginAllowed(origin, env)) return {}

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cache-Control, Pragma',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin, Authorization, Access-Control-Request-Method, Access-Control-Request-Headers',
  }
}

const getRoomStub = (request, env) => {
  const url = new URL(request.url)
  const roomId = getRoomIdFromUrl(url)
  const id = env.ONLINE_COUNTER.idFromName(roomId)
  return env.ONLINE_COUNTER.get(id)
}

const withCors = (response, origin, env) => {
  const headers = new Headers(response.headers)
  for (const [key, value] of Object.entries(getCorsHeaders(origin, env))) {
    headers.set(key, value)
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export class OnlineCounter {
  constructor(state, env) {
    this.state = state
    this.env = env
  }

  getSessionMeta(ws) {
    try {
      return {
        ...getDefaultSessionMeta(),
        ...(ws.deserializeAttachment() || {}),
      }
    } catch {
      return getDefaultSessionMeta()
    }
  }

  setSessionMeta(ws, meta = {}) {
    const current = this.getSessionMeta(ws)
    ws.serializeAttachment({
      ...current,
      ...meta,
      roomId: normalizeRoomId(meta.roomId ?? current.roomId),
      userId: String(meta.userId ?? current.userId ?? '').slice(0, 128),
      username: sanitizeUsername(meta.username ?? current.username),
      authenticated: Boolean(meta.authenticated ?? current.authenticated),
      lastMessageAt: Number(meta.lastMessageAt ?? current.lastMessageAt) || 0,
    })
  }

  async fetch(request) {
    const url = new URL(request.url)
    const roomId = getRoomIdFromUrl(url)

    if (url.pathname === '/count') {
      return jsonResponse(this.getPresence(roomId))
    }

    if (url.pathname === '/history') {
      return jsonResponse({
        type: 'history',
        roomId,
        messages: await this.getRecentMessages(roomId),
      })
    }

    const upgradeHeader = request.headers.get('Upgrade')
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 })
    }

    const auth = await verifyStudyToken(getBearerToken(request), this.env)
    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)

    this.state.acceptWebSocket(server)
    this.setSessionMeta(server, {
      roomId,
      userId: auth?.userId || '',
      username: auth?.username || sanitizeUsername(url.searchParams.get('username')),
      authenticated: Boolean(auth),
    })

    this.sendJson(server, {
      type: 'history',
      roomId,
      messages: await this.getRecentMessages(roomId),
    })
    this.broadcastPresence(roomId)

    return new Response(null, {
      status: 101,
      webSocket: client,
    })
  }

  async webSocketMessage(ws, message) {
    try {
      const data = JSON.parse(message)

      if (data.type === 'ping') {
        this.sendJson(ws, { type: 'pong' })
        return
      }

      if (data.type === 'auth') {
        await this.handleAuth(ws, data.token)
        return
      }

      if (data.type === 'username') {
        const meta = this.getSessionMeta(ws)
        if (!meta.authenticated) {
          this.setSessionMeta(ws, { username: data.username || '' })
          this.broadcastPresence(meta.roomId)
        }
        return
      }

      if (data.type === 'chat' || data.type === 'message') {
        await this.handleChatMessage(ws, data)
      }
    } catch (err) {
      console.error('Parse error:', err)
      this.sendError(ws, 'bad_request', '消息格式错误')
    }
  }

  async webSocketClose(ws) {
    const meta = this.getSessionMeta(ws)
    this.broadcastPresence(meta.roomId)
  }

  async webSocketError(ws) {
    const meta = this.getSessionMeta(ws)
    this.broadcastPresence(meta.roomId)
  }

  async handleAuth(ws, token) {
    const auth = await verifyStudyToken(token, this.env)
    if (!auth) {
      this.sendError(ws, 'unauthorized', '登录已失效')
      return
    }

    const meta = this.getSessionMeta(ws)
    this.setSessionMeta(ws, {
      userId: auth.userId,
      username: auth.username,
      authenticated: true,
    })
    this.sendJson(ws, {
      type: 'auth',
      ok: true,
      userId: auth.userId,
      username: auth.username,
    })
    this.broadcastPresence(meta.roomId)
  }

  async handleChatMessage(ws, data) {
    const meta = this.getSessionMeta(ws)
    const content = sanitizeContent(data.content ?? data.message)

    if (!content) {
      this.sendError(ws, 'empty_message', '消息不能为空')
      return
    }

    if (!this.env.STUDY_JWT_SECRET) {
      this.sendError(ws, 'server_misconfigured', '聊天服务未配置鉴权密钥')
      return
    }

    if (!meta.authenticated) {
      this.sendError(ws, 'unauthorized', '请先登录后发言')
      return
    }

    const now = Date.now()
    if (meta.lastMessageAt && now - meta.lastMessageAt < CHAT_THROTTLE_MS) {
      this.sendError(ws, 'rate_limited', '发送太频繁了')
      return
    }

    const username = meta.username || sanitizeUsername(data.username) || '游客'
    const chatMessage = {
      id: crypto.randomUUID(),
      roomId: meta.roomId,
      userId: meta.authenticated ? meta.userId : '',
      username,
      content,
      createdAt: new Date(now).toISOString(),
    }

    this.setSessionMeta(ws, {
      username,
      lastMessageAt: now,
    })
    await this.saveMessage(chatMessage, now)
    this.broadcastToRoom(meta.roomId, {
      type: 'chat',
      message: chatMessage,
    })
  }

  getPresence(roomId) {
    const sessions = this.state.getWebSockets().filter(session => {
      const meta = this.getSessionMeta(session)
      return meta.roomId === roomId
    })
    const adminOnline = sessions.some(session => {
      const meta = this.getSessionMeta(session)
      return meta.username === 'shshouse'
    })

    return {
      type: 'count',
      roomId,
      count: sessions.length,
      adminOnline,
    }
  }

  broadcastPresence(roomId) {
    this.broadcastToRoom(roomId, this.getPresence(roomId))
  }

  broadcastToRoom(roomId, payload) {
    const message = JSON.stringify(payload)
    const sessions = this.state.getWebSockets()

    for (const session of sessions) {
      try {
        const meta = this.getSessionMeta(session)
        if (meta.roomId === roomId) {
          session.send(message)
        }
      } catch {
      }
    }
  }

  sendJson(ws, payload) {
    try {
      ws.send(JSON.stringify(payload))
    } catch {
    }
  }

  sendError(ws, code, message) {
    this.sendJson(ws, {
      type: 'error',
      code,
      message,
    })
  }

  async getRecentMessages(roomId) {
    if (!this.env.CHAT_DB) return []

    try {
      const { results = [] } = await this.env.CHAT_DB
        .prepare(`
          SELECT id, room_id, user_id, username, content, created_at
          FROM chat_messages
          WHERE room_id = ?
          ORDER BY created_at DESC
          LIMIT ?
        `)
        .bind(roomId, MAX_HISTORY_LIMIT)
        .all()

      return results.reverse().map(row => ({
        id: String(row.id),
        roomId: String(row.room_id),
        userId: String(row.user_id || ''),
        username: String(row.username || ''),
        content: String(row.content || ''),
        createdAt: new Date(Number(row.created_at)).toISOString(),
      }))
    } catch (err) {
      console.error('D1 history error:', err)
      return []
    }
  }

  async saveMessage(message, createdAt) {
    if (!this.env.CHAT_DB) return

    try {
      await this.env.CHAT_DB.batch([
        this.env.CHAT_DB
          .prepare(`
            INSERT INTO chat_rooms (id, name, created_at, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at
          `)
          .bind(message.roomId, message.roomId, createdAt, createdAt),
        this.env.CHAT_DB
          .prepare(`
            INSERT INTO chat_messages (id, room_id, user_id, username, content, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
          `)
          .bind(message.id, message.roomId, message.userId, message.username, message.content, createdAt),
      ])
    } catch (err) {
      console.error('D1 save error:', err)
    }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const origin = request.headers.get('Origin')

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: getCorsHeaders(origin, env),
      })
    }

    if (url.pathname === '/health') {
      return jsonResponse({
        ok: true,
        d1: Boolean(env.CHAT_DB),
      }, {
        headers: getCorsHeaders(origin, env),
      })
    }

    if (url.pathname === '/ws') {
      if (!isOriginAllowed(origin, env)) {
        return new Response('Forbidden', { status: 403 })
      }

      const upgradeHeader = request.headers.get('Upgrade')
      if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
        return new Response('Expected WebSocket', { status: 426 })
      }

      return getRoomStub(request, env).fetch(request)
    }

    if (url.pathname === '/count' || url.pathname === '/history') {
      if (!isOriginAllowed(origin, env)) {
        return new Response('Forbidden', { status: 403 })
      }

      const response = await getRoomStub(request, env).fetch(request)
      return withCors(response, origin, env)
    }

    return new Response('OK', { status: 200 })
  },
}
