const CHAT_ROOM_ID = 'global'
const MAX_USERNAME_LENGTH = 40
const MAX_MESSAGE_LENGTH = 500
const MAX_LOCATION_LENGTH = 20
const HISTORY_PAGE_SIZE = 50
const HISTORY_PAGE_LIMIT = 100
const CHAT_THROTTLE_MS = 1500
const HISTORY_THROTTLE_MS = 400
const TOKEN_EXPIRY_SECONDS = 30 * 24 * 60 * 60
const CLOCK_SKEW_TOLERANCE_SECONDS = 60
const CLIENT_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/
// 客户端据此决定能不能依赖 ack 重发。没有握手的老客户端会忽略这条消息。
const SERVER_CAPS = ['client_id_v1', 'chat_ack_v1']

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
  tokenIat: 0,
  tokenExp: 0,
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

// 只校验格式，不维护贴纸清单：新增贴纸不该要求重新部署 worker
const STICKER_MESSAGE_PATTERN = /^\[sticker:\d{1,4}\]$/
const isStickerMessage = (value) => STICKER_MESSAGE_PATTERN.test(String(value || ''))

const sanitizeClientId = (value) => {
  const str = String(value || '').trim()
  return CLIENT_ID_PATTERN.test(str) ? str : ''
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
    if (payload.iat > now + CLOCK_SKEW_TOLERANCE_SECONDS) return null
    if (payload.iat < now - TOKEN_EXPIRY_SECONDS) return null
    if (minIat > 0 && payload.iat < minIat) return null
    if (typeof payload.exp !== 'number') return null
    if (payload.exp < now) return null
    if (payload.exp > payload.iat + TOKEN_EXPIRY_SECONDS + CLOCK_SKEW_TOLERANCE_SECONDS) return null

    return {
      userId: payload.sub,
      username: sanitizeUsername(payload.username || payload.sub.slice(0, 8)),
      iat: payload.iat,
      exp: payload.exp,
    }
  } catch {
    return null
  }
}

const getTokenValidFrom = async (userId, env) => {
  const baseUrl = String(env.SUPABASE_URL || '').replace(/\/+$/, '')
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
  // 吊销功能还没配置或还没建表时按未启用处理，不能因此让所有人发不出消息
  if (!baseUrl || !serviceKey) return 0

  const response = await fetch(
    `${baseUrl}/rest/v1/auth_state?select=valid_from_iat&user_id=eq.${encodeURIComponent(userId)}`,
    {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Accept: 'application/json',
        'Accept-Profile': 'study',
      },
    }
  )
  if (response.status === 404) return 0
  if (!response.ok) throw new Error(`Supabase revocation lookup failed: ${response.status}`)

  const rows = await response.json()
  const validFrom = Array.isArray(rows) ? Number(rows[0]?.valid_from_iat ?? 0) : 0
  return Number.isFinite(validFrom) ? validFrom : 0
}

const verifyActiveStudyToken = async (token, env) => {
  const auth = await verifyStudyToken(token, env)
  if (!auth) return null

  try {
    const validFrom = await getTokenValidFrom(auth.userId, env)
    return auth.iat >= validFrom ? auth : null
  } catch (error) {
    console.error('Study token revocation check failed:', error)
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
const PLAYLIST_ID_PATTERN = /^\d{1,20}$/
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const PLAYLIST_NAME_SOURCES = {
  netease: (id) => ({
    url: `https://music.163.com/api/playlist/detail?id=${id}&n=0&s=0`,
    referer: 'https://music.163.com/',
    pick: (data) => data?.result?.name,
  }),
  tencent: (id) => ({
    url: `https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?type=1&json=1&utf8=1&onlysong=0&disstid=${id}&format=json&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=0`,
    referer: 'https://y.qq.com/',
    pick: (data) => data?.cdlist?.[0]?.dissname,
  }),
}

const fetchPlaylistNameOnce = async (platform, id) => {
  const build = PLAYLIST_NAME_SOURCES[platform]
  if (!build) return { name: '', reason: 'unknown_platform' }

  const { url, referer, pick } = build(id)

  try {
    const upstream = await fetch(url, {
      headers: { Referer: referer, 'User-Agent': BROWSER_UA },
    })
    if (!upstream.ok) {
      return { name: '', reason: `http_${upstream.status}` }
    }

    const text = await upstream.text()
    let data
    try {
      data = JSON.parse(text)
    } catch {
      return { name: '', reason: `bad_json:${text.slice(0, 60)}` }
    }

    const name = pick(data)
    if (typeof name !== 'string' || !name.trim()) {
      return { name: '', reason: `no_name:${JSON.stringify(data).slice(0, 120)}` }
    }
    return { name: name.trim().slice(0, 100), reason: '' }
  } catch (err) {
    return { name: '', reason: `fetch_error:${String(err)}` }
  }
}

const fetchPlaylistName = async (platform, id) => {
  let reason = ''
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await fetchPlaylistNameOnce(platform, id)
    if (result.name) return { name: result.name, reason: '' }
    reason = result.reason
    console.error(`playlist-name attempt ${attempt + 1} failed: ${reason}`)
  }
  return { name: '', reason }
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
    this.pendingChatMessages = new WeakSet()
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
      tokenIat: Number(meta.tokenIat ?? current.tokenIat) || 0,
      tokenExp: Number(meta.tokenExp ?? current.tokenExp) || 0,
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

    const auth = await verifyActiveStudyToken(getBearerToken(request), this.env)
    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)

    this.state.acceptWebSocket(server)
    this.setSessionMeta(server, {
      userId: auth?.userId || '',
      username: auth?.username || sanitizeUsername(url.searchParams.get('username')),
      authenticated: Boolean(auth),
      tokenIat: auth?.iat || 0,
      tokenExp: auth?.exp || 0,
    })

    const initial = await this.getMessagesPage({ before: null, limit: HISTORY_PAGE_SIZE })
    this.sendJson(server, { type: 'hello', caps: SERVER_CAPS })
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
    const auth = await verifyActiveStudyToken(token, this.env)
    if (!auth) {
      this.sendError(ws, 'unauthorized', '登录已失效')
      return
    }

    this.setSessionMeta(ws, {
      userId: auth.userId,
      username: auth.username,
      authenticated: true,
      tokenIat: auth.iat,
      tokenExp: auth.exp,
    })
    this.sendJson(ws, {
      type: 'auth',
      ok: true,
      userId: auth.userId,
      username: auth.username,
      caps: SERVER_CAPS,
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

  async isSessionAuthorized(meta) {
    if (!meta.authenticated || !meta.userId) return false
    const now = Math.floor(Date.now() / 1000)
    if (!meta.tokenIat || !meta.tokenExp) return false
    if (meta.tokenIat > now + CLOCK_SKEW_TOLERANCE_SECONDS) return false
    if (meta.tokenIat < now - TOKEN_EXPIRY_SECONDS) return false
    if (meta.tokenExp < now) return false

    try {
      const validFrom = await getTokenValidFrom(meta.userId, this.env)
      return meta.tokenIat >= validFrom
    } catch (error) {
      console.error('Study session revocation check failed:', error)
      return false
    }
  }

  async handleChatMessage(ws, data) {
    const meta = this.getSessionMeta(ws)
    const content = sanitizeContent(data.content ?? data.message)
    const clientId = sanitizeClientId(data.clientId)

    if (!content) {
      this.sendError(ws, 'empty_message', '消息不能为空', clientId)
      return
    }

    if (!this.env.STUDY_JWT_SECRET) {
      this.sendError(ws, 'server_misconfigured', '聊天服务未配置鉴权密钥', clientId)
      return
    }

    if (!meta.authenticated) {
      this.sendError(ws, 'unauthorized', '请先登录后发言', clientId)
      return
    }

    if (!(await this.isSessionAuthorized(meta))) {
      this.setSessionMeta(ws, {
        authenticated: false,
        userId: '',
        tokenIat: 0,
        tokenExp: 0,
      })
      this.broadcastPresence()
      this.sendError(ws, 'unauthorized', '登录已失效，请重新登录', clientId)
      return
    }

    if (clientId) {
      const dedupe = await this.messageExists(clientId)
      if (dedupe === 'unknown') {
        // 无法确认是否已写入时不能放行，否则重发会变成第二条消息
        this.sendError(ws, 'persistence_failed', '消息保存失败，请稍后重试', clientId)
        return
      }
      if (dedupe === 'exists') {
        this.ackMessage(ws, clientId, clientId)
        return
      }
    }

    const now = Date.now()
    if (this.pendingChatMessages.has(ws) || (meta.lastMessageAt && now - meta.lastMessageAt < CHAT_THROTTLE_MS)) {
      this.sendError(ws, 'rate_limited', '发送太频繁了', clientId)
      return
    }

    const username = meta.username || sanitizeUsername(data.username) || '游客'
    const location = sanitizeLocation(data.location)
    const chatMessage = {
      id: clientId || crypto.randomUUID(),
      roomId: CHAT_ROOM_ID,
      userId: meta.authenticated ? meta.userId : '',
      username,
      content,
      location,
      createdAt: new Date(now).toISOString(),
    }

    this.pendingChatMessages.add(ws)
    try {
      const saved = await this.saveMessage(chatMessage, now)
      if (!saved) {
        this.sendError(ws, 'persistence_failed', '消息保存失败，请稍后重试', clientId)
        return
      }

      this.setSessionMeta(ws, {
        username,
        lastMessageAt: now,
      })

      // 主键已存在说明这次是重发，消息本来就在，不必再广播一遍
      if (saved === 'duplicate') {
        if (clientId) this.ackMessage(ws, clientId, chatMessage.id)
        return
      }

      this.broadcast({
        type: 'chat',
        message: clientId ? { ...chatMessage, clientId } : chatMessage,
      })
      if (clientId) this.ackMessage(ws, clientId, chatMessage.id)
    } finally {
      this.pendingChatMessages.delete(ws)
    }
  }

  async messageExists(id) {
    if (!this.env.CHAT_DB) return 'unknown'
    try {
      const row = await this.env.CHAT_DB
        .prepare('SELECT id FROM chat_messages WHERE id = ?')
        .bind(id)
        .first()
      return row ? 'exists' : 'missing'
    } catch (error) {
      console.error('D1 dedupe lookup failed:', error)
      return 'unknown'
    }
  }

  ackMessage(ws, clientId, id) {
    this.sendJson(ws, { type: 'chat_ack', clientId, id })
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

  sendError(ws, code, message, clientId = '') {
    this.sendJson(ws, {
      type: 'error',
      code,
      message,
      ...(clientId ? { clientId } : {}),
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
    if (!this.env.CHAT_DB) return false

    try {
      const results = await this.env.CHAT_DB.batch([
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
            ON CONFLICT(id) DO NOTHING
          `)
          .bind(message.id, CHAT_ROOM_ID, message.userId, message.username, message.content, createdAt, message.location || ''),
      ])

      // changes 为 0 表示这行已经存在，本次是重发而不是新消息
      const changes = results?.[1]?.meta ? Number(results[1].meta.changes) : null
      return changes === 0 ? 'duplicate' : 'saved'
    } catch (err) {
      console.error('D1 save error:', err)
      return false
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

    if (url.pathname === '/playlist-name') {
      if (!isOriginAllowed(origin, env)) {
        return new Response('Forbidden', { status: 403 })
      }

      const platform = String(url.searchParams.get('platform') || '').trim()
      const id = String(url.searchParams.get('id') || '').trim()
      if (!PLAYLIST_ID_PATTERN.test(id)) {
        return jsonResponse({ name: '', reason: 'bad_id' }, { headers: getCorsHeaders(origin, env) })
      }

      const { name, reason } = await fetchPlaylistName(platform, id)
      return jsonResponse({ name, reason }, {
        headers: {
          ...getCorsHeaders(origin, env),
          'Cache-Control': name ? 'public, max-age=86400' : 'no-store',
        },
      })
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
