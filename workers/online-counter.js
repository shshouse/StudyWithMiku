import { STICKER_FILES } from '../src/data/stickers.js'

const CHAT_ROOM_ID = 'global'
const MAX_USERNAME_LENGTH = 40
const MAX_MESSAGE_LENGTH = 500
const MAX_LOCATION_LENGTH = 20
const HISTORY_PAGE_SIZE = 50
const HISTORY_PAGE_LIMIT = 100
const CHAT_THROTTLE_MS = 1500
const HISTORY_THROTTLE_MS = 400

const LOCATION_WHITELIST = new Set([
  '北京', '天津', '河北', '山西', '内蒙古', '辽宁', '吉林', '黑龙江',
  '上海', '江苏', '浙江', '安徽', '福建', '江西', '山东', '河南',
  '湖北', '湖南', '广东', '广西', '海南', '重庆', '四川', '贵州',
  '云南', '陕西', '甘肃', '青海', '宁夏', '新疆', '西藏',
  '中国台湾', '中国香港', '中国澳门', '中国',
  '美国', '日本', '韩国', '英国', '德国', '法国', '澳大利亚', '加拿大',
  '新加坡', '马来西亚', '泰国', '越南', '菲律宾', '印尼', '印度', '俄罗斯',
  '巴西', '墨西哥', '意大利', '西班牙', '荷兰', '瑞典', '瑞士', '新西兰',
  '阿联酋', '沙特', '南非', '埃及', '土耳其', '波兰', '乌克兰', '以色列',
  '阿根廷', '哥伦比亚', '秘鲁', '智利', '捷克', '罗马尼亚', '匈牙利',
  '希腊', '葡萄牙', '挪威', '芬兰', '丹麦', '爱尔兰', '奥地利', '比利时',
  '哈萨克斯坦', '巴基斯坦', '孟加拉', '缅甸', '柬埔寨', '老挝', '尼泊尔',
  '蒙古', '伊朗', '伊拉克', '格鲁吉亚', '阿塞拜疆',
])

const sanitizeLocation = (value) => {
  const str = String(value || '').trim()
  if (!str) return ''
  if (LOCATION_WHITELIST.has(str)) return str
  return '黑客-艾鲁迪克'
}

const getDefaultSessionMeta = () => ({
  userId: '',
  username: '',
  authenticated: false,
  lastMessageAt: 0,
  lastHistoryLoadAt: 0,
})

const getAdminUserIds = (env) => new Set(
  String(env?.ADMIN_USER_IDS || '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean)
)

const sanitizeUsername = (value) => String(value || '').trim().slice(0, MAX_USERNAME_LENGTH)

const STICKER_MESSAGE_PATTERN = /^\[sticker:(\d+)\]$/
const isStickerMessage = (value) => {
  const match = STICKER_MESSAGE_PATTERN.exec(String(value || ''))
  return !!match && !!STICKER_FILES[Number(match[1])]
}

const sanitizeContent = (value) => {
  const str = String(value || '').trim().slice(0, MAX_MESSAGE_LENGTH)
  if (str.startsWith('[sticker:')) {
    return isStickerMessage(str) ? str : ''
  }
  return str
}

const parsePositiveInt = (value, fallback) => {
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

const parseCursor = (value) => {
  if (value === null || value === undefined || value === '') return null
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

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

const getCounterStub = (env) => {
  const id = env.ONLINE_COUNTER.idFromName(CHAT_ROOM_ID)
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
      userId: String(meta.userId ?? current.userId ?? '').slice(0, 128),
      username: sanitizeUsername(meta.username ?? current.username),
      authenticated: Boolean(meta.authenticated ?? current.authenticated),
      lastMessageAt: Number(meta.lastMessageAt ?? current.lastMessageAt) || 0,
      lastHistoryLoadAt: Number(meta.lastHistoryLoadAt ?? current.lastHistoryLoadAt) || 0,
    })
  }

  async fetch(request) {
    const url = new URL(request.url)

    if (url.pathname === '/count') {
      return jsonResponse(this.getPresence())
    }

    if (url.pathname === '/history') {
      const before = parseCursor(url.searchParams.get('before'))
      const limit = Math.min(
        parsePositiveInt(url.searchParams.get('limit'), HISTORY_PAGE_SIZE),
        HISTORY_PAGE_LIMIT,
      )
      const { messages, hasMore } = await this.getMessagesPage({ before, limit })
      return jsonResponse({
        type: 'history',
        messages,
        hasMore,
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
      userId: auth?.userId || '',
      username: auth?.username || sanitizeUsername(url.searchParams.get('username')),
      authenticated: Boolean(auth),
    })

    const initial = await this.getMessagesPage({ before: null, limit: HISTORY_PAGE_SIZE })
    this.sendJson(server, {
      type: 'history',
      messages: initial.messages,
      hasMore: initial.hasMore,
    })
    this.broadcastPresence()

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
          this.broadcastPresence()
        }
        return
      }

      if (data.type === 'load_history') {
        await this.handleLoadHistory(ws, data)
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
    this.broadcastPresence()
  }

  async webSocketError(ws) {
    this.broadcastPresence()
  }

  async handleAuth(ws, token) {
    const auth = await verifyStudyToken(token, this.env)
    if (!auth) {
      this.sendError(ws, 'unauthorized', '登录已失效')
      return
    }

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
    this.broadcastPresence()
  }

  async handleLoadHistory(ws, data) {
    const meta = this.getSessionMeta(ws)
    const now = Date.now()
    if (meta.lastHistoryLoadAt && now - meta.lastHistoryLoadAt < HISTORY_THROTTLE_MS) {
      this.sendError(ws, 'rate_limited', '加载太频繁了')
      return
    }

    const before = parseCursor(data.before)
    const limit = Math.min(parsePositiveInt(data.limit, HISTORY_PAGE_SIZE), HISTORY_PAGE_LIMIT)

    this.setSessionMeta(ws, { lastHistoryLoadAt: now })

    const { messages, hasMore } = await this.getMessagesPage({ before, limit })
    this.sendJson(ws, {
      type: 'history_chunk',
      before,
      messages,
      hasMore,
    })
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
    const location = sanitizeLocation(data.location)
    const chatMessage = {
      id: crypto.randomUUID(),
      roomId: CHAT_ROOM_ID,
      userId: meta.authenticated ? meta.userId : '',
      username,
      content,
      location,
      createdAt: new Date(now).toISOString(),
    }

    this.setSessionMeta(ws, {
      username,
      lastMessageAt: now,
    })
    await this.saveMessage(chatMessage, now)
    this.broadcast({
      type: 'chat',
      message: chatMessage,
    })
  }

  getPresence() {
    const sessions = this.state.getWebSockets()
    const adminIds = getAdminUserIds(this.env)
    const adminOnline = sessions.some(session => {
      const meta = this.getSessionMeta(session)
      return meta.authenticated && adminIds.has(meta.userId)
    })

    return {
      type: 'count',
      count: sessions.length,
      adminOnline,
    }
  }

  broadcastPresence() {
    this.broadcast(this.getPresence())
  }

  broadcast(payload) {
    const message = JSON.stringify(payload)
    const sessions = this.state.getWebSockets()

    for (const session of sessions) {
      try {
        session.send(message)
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

  async getMessagesPage({ before = null, limit = HISTORY_PAGE_SIZE } = {}) {
    if (!this.env.CHAT_DB) return { messages: [], hasMore: false }

    const safeLimit = Math.min(Math.max(1, Math.floor(limit) || HISTORY_PAGE_SIZE), HISTORY_PAGE_LIMIT)
    const fetchLimit = safeLimit + 1

    try {
      const stmt = before
        ? this.env.CHAT_DB
            .prepare(`
              SELECT id, user_id, username, content, created_at, location
              FROM chat_messages
              WHERE room_id = ? AND created_at < ?
              ORDER BY created_at DESC
              LIMIT ?
            `)
            .bind(CHAT_ROOM_ID, before, fetchLimit)
        : this.env.CHAT_DB
            .prepare(`
              SELECT id, user_id, username, content, created_at, location
              FROM chat_messages
              WHERE room_id = ?
              ORDER BY created_at DESC
              LIMIT ?
            `)
            .bind(CHAT_ROOM_ID, fetchLimit)

      const { results = [] } = await stmt.all()
      const hasMore = results.length > safeLimit
      const trimmed = hasMore ? results.slice(0, safeLimit) : results

      return {
        messages: trimmed.reverse().map(row => ({
          id: String(row.id),
          userId: String(row.user_id || ''),
          username: String(row.username || ''),
          content: String(row.content || ''),
          createdAt: new Date(Number(row.created_at)).toISOString(),
          location: String(row.location || ''),
        })),
        hasMore,
      }
    } catch (err) {
      console.error('D1 history error:', err)
      return { messages: [], hasMore: false }
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
          .bind(CHAT_ROOM_ID, CHAT_ROOM_ID, createdAt, createdAt),
        this.env.CHAT_DB
          .prepare(`
            INSERT INTO chat_messages (id, room_id, user_id, username, content, created_at, location)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `)
          .bind(message.id, CHAT_ROOM_ID, message.userId, message.username, message.content, createdAt, message.location || ''),
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

      return getCounterStub(env).fetch(request)
    }

    if (url.pathname === '/count' || url.pathname === '/history') {
      if (!isOriginAllowed(origin, env)) {
        return new Response('Forbidden', { status: 403 })
      }

      const response = await getCounterStub(env).fetch(request)
      return withCors(response, origin, env)
    }

    return new Response('OK', { status: 200 })
  },
}
