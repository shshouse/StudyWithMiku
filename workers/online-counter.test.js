import assert from 'node:assert/strict'
import test from 'node:test'

import { OnlineCounter } from './online-counter.js'

const NOW = 1700000000000
const PERSISTENCE_ERROR = {
  type: 'error',
  code: 'persistence_failed',
  message: '消息保存失败，请稍后重试',
}
const RATE_LIMIT_ERROR = {
  type: 'error',
  code: 'rate_limited',
  message: '发送太频繁了',
}

function createSocket(onSend, overrides = {}) {
  const nowSeconds = Math.floor(Date.now() / 1000)
  let attachment = {
    userId: 'user-1',
    username: '测试用户',
    authenticated: true,
    tokenIat: nowSeconds,
    tokenExp: nowSeconds + 3600,
    lastMessageAt: 0,
    lastHistoryLoadAt: 0,
    ...overrides,
  }
  const sent = []

  return {
    sent,
    deserializeAttachment: () => attachment,
    serializeAttachment: value => {
      attachment = value
    },
    send: value => {
      const payload = JSON.parse(value)
      sent.push(payload)
      onSend?.(payload)
    },
  }
}

function createDb(runBatch = async () => [], existingIds = new Set(), { lookupError = false } = {}) {
  const batches = []

  return {
    batches,
    prepare: sql => ({
      bind: (...args) => ({
        sql,
        args,
        first: async () => {
          if (lookupError) throw new Error('D1 lookup failed')
          return existingIds.has(args[0]) ? { id: args[0] } : null
        },
      }),
    }),
    batch: async statements => {
      batches.push(statements)
      return runBatch(statements)
    },
  }
}

function setup({ db, onSend, senderMeta, validFrom = 0, authStateError = false, env = {} } = {}) {
  const sender = createSocket(payload => onSend?.('sender', payload), senderMeta)
  const peer = createSocket(payload => onSend?.('peer', payload))
  globalThis.fetch = async () => {
    if (authStateError) throw new Error('Supabase unavailable')
    return new Response(JSON.stringify(validFrom ? [{ valid_from_iat: validFrom }] : []), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const counter = new OnlineCounter(
    { getWebSockets: () => [sender, peer] },
    {
      STUDY_JWT_SECRET: 'test-secret',
      CHAT_DB: db,
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-key',
      ...env,
    },
  )

  return { counter, sender, peer }
}

function assertPersistenceFailure(sender, peer) {
  assert.deepEqual(peer.sent, [])
  assert.deepEqual(sender.sent, [PERSISTENCE_ERROR])
  assert.equal(sender.deserializeAttachment().lastMessageAt, 0)
}

test('missing CHAT_DB reports a persistence error without broadcasting', async () => {
  const { counter, sender, peer } = setup()

  await counter.handleChatMessage(sender, { content: '不能丢失的消息' })

  assertPersistenceFailure(sender, peer)
})

test('D1 batch rejection reports a persistence error without broadcasting', async t => {
  t.mock.method(console, 'error', () => {})
  const db = createDb(async () => {
    throw new Error('D1 unavailable')
  })
  const { counter, sender, peer } = setup({ db })

  await counter.handleChatMessage(sender, { content: '不能丢失的消息' })

  assert.equal(db.batches.length, 1)
  assertPersistenceFailure(sender, peer)
})

test('a chat broadcast follows successful D1 persistence', async t => {
    t.mock.method(Date, 'now', () => NOW)
  const events = []
  const db = createDb(async () => {
    events.push('batch')
    return []
  })
  const { counter, sender, peer } = setup({
    db,
    onSend: (recipient, payload) => events.push(`${recipient}:${payload.type}`),
  })

  await counter.handleChatMessage(sender, { content: '已保存的消息' })

  assert.deepEqual(events, ['batch', 'sender:chat', 'peer:chat'])
  assert.equal(db.batches.length, 1)
  assert.equal(db.batches[0].length, 2)
  assert.equal(db.batches[0][1].args[4], '已保存的消息')
  assert.equal(db.batches[0][1].args[5], NOW)
  assert.equal(sender.deserializeAttachment().lastMessageAt, NOW)
  assert.equal(peer.sent[0].type, 'chat')
})

test('a second message is rate limited while its D1 save is in flight', async () => {
  let finishFirstBatch
  const firstBatch = new Promise(resolve => {
    finishFirstBatch = resolve
  })
  const db = createDb(async () => db.batches.length === 1 ? firstBatch : [])
  const { counter, sender, peer } = setup({ db })

  const firstMessage = counter.handleChatMessage(sender, { content: '第一条消息' })
  await counter.handleChatMessage(sender, { content: '在途的第二条消息' })

  const batchesWhilePending = db.batches.length
  const senderMessagesWhilePending = [...sender.sent]
  const peerMessagesWhilePending = [...peer.sent]
  finishFirstBatch([])
  await firstMessage

  assert.equal(batchesWhilePending, 1)
  assert.deepEqual(senderMessagesWhilePending, [RATE_LIMIT_ERROR])
  assert.deepEqual(peerMessagesWhilePending, [])
  assert.equal(sender.sent.filter(payload => payload.type === 'chat').length, 1)
  assert.equal(peer.sent.filter(payload => payload.type === 'chat').length, 1)
})

test('a failed D1 save can be retried immediately', async t => {
  t.mock.method(console, 'error', () => {})
  let attempts = 0
  const db = createDb(async () => {
    attempts += 1
    if (attempts === 1) throw new Error('D1 unavailable')
    return []
  })
  const { counter, sender, peer } = setup({ db })

  await counter.handleChatMessage(sender, { content: '第一次发送' })
  await counter.handleChatMessage(sender, { content: '立即重试' })

  assert.equal(db.batches.length, 2)
  assert.deepEqual(sender.sent.map(payload => payload.type), ['error', 'chat'])
  assert.equal(peer.sent.length, 1)
  assert.equal(peer.sent[0].message.content, '立即重试')
})

test('a client id becomes the message id and is confirmed with an ack', async t => {
  t.mock.method(Date, 'now', () => NOW)
  const events = []
  const db = createDb(async () => {
    events.push('batch')
    return []
  })
  const { counter, sender, peer } = setup({
    db,
    onSend: (recipient, payload) => events.push(`${recipient}:${payload.type}`),
  })

  await counter.handleChatMessage(sender, { clientId: 'client-1234-abcd', content: '带确认的消息' })

  assert.deepEqual(events, ['batch', 'sender:chat', 'peer:chat', 'sender:chat_ack'])
  assert.equal(db.batches[0][1].args[0], 'client-1234-abcd')
  assert.equal(peer.sent[0].message.clientId, 'client-1234-abcd')
  assert.deepEqual(sender.sent[sender.sent.length - 1], {
    type: 'chat_ack',
    clientId: 'client-1234-abcd',
    id: 'client-1234-abcd',
  })
})

test('a resent client id is acknowledged without a second write', async () => {
  const db = createDb(async () => [], new Set(['client-1234-abcd']))
  const { counter, sender, peer } = setup({ db })

  await counter.handleChatMessage(sender, { clientId: 'client-1234-abcd', content: '重复提交' })

  assert.equal(db.batches.length, 0)
  assert.deepEqual(peer.sent, [])
  assert.deepEqual(sender.sent, [
    { type: 'chat_ack', clientId: 'client-1234-abcd', id: 'client-1234-abcd' },
  ])
})

test('a rejected message names the client id so the sender can retry it', async () => {
  const { counter, sender, peer } = setup()

  await counter.handleChatMessage(sender, { clientId: 'client-1234-abcd', content: '不能丢失的消息' })

  assert.deepEqual(peer.sent, [])
  assert.deepEqual(sender.sent, [
    {
      type: 'error',
      code: 'persistence_failed',
      message: '消息保存失败，请稍后重试',
      clientId: 'client-1234-abcd',
    },
  ])
})

test('an expired session cannot send messages', async () => {
  const nowSeconds = Math.floor(Date.now() / 1000)
  const { counter, sender, peer } = setup({
    senderMeta: { tokenIat: nowSeconds - 100, tokenExp: nowSeconds - 1 },
  })

  await counter.handleChatMessage(sender, { content: '过期会话' })

  assert.equal(peer.sent.some(payload => payload.type === 'chat'), false)
  assert.equal(sender.sent.find(payload => payload.type === 'error')?.code, 'unauthorized')
})

test('a session revoked on another device cannot send messages', async () => {
  const nowSeconds = Math.floor(Date.now() / 1000)
  const { counter, sender, peer } = setup({
    senderMeta: { tokenIat: nowSeconds - 100, tokenExp: nowSeconds + 3600 },
    validFrom: nowSeconds - 99,
  })

  await counter.handleChatMessage(sender, { content: '已撤销会话' })

  assert.equal(peer.sent.some(payload => payload.type === 'chat'), false)
  assert.equal(sender.sent.find(payload => payload.type === 'error')?.code, 'unauthorized')
})

test('a failed revocation lookup rejects the message', async t => {
  t.mock.method(console, 'error', () => {})
  const { counter, sender, peer } = setup({ authStateError: true })

  await counter.handleChatMessage(sender, { content: '无法确认撤销状态' })

  assert.equal(peer.sent.some(payload => payload.type === 'chat'), false)
  assert.equal(sender.sent.find(payload => payload.type === 'error')?.code, 'unauthorized')
})

test('a failed dedupe lookup rejects the message instead of writing again', async t => {
  t.mock.method(console, 'error', () => {})
  const db = createDb(async () => [], new Set(), { lookupError: true })
  const { counter, sender, peer } = setup({ db })

  await counter.handleChatMessage(sender, { clientId: 'client-1234-abcd', content: '查不到去重状态' })

  assert.equal(db.batches.length, 0)
  assert.deepEqual(peer.sent, [])
  assert.deepEqual(sender.sent, [
    {
      type: 'error',
      code: 'persistence_failed',
      message: '消息保存失败，请稍后重试',
      clientId: 'client-1234-abcd',
    },
  ])
})

test('a primary key collision acknowledges without a second broadcast', async t => {
  t.mock.method(Date, 'now', () => NOW)
  // 两个请求并发时，查重都还没看到对方写入，插入阶段由主键挡住
  const db = createDb(async () => [
    { meta: { changes: 1 } },
    { meta: { changes: 0 } },
  ])
  const { counter, sender, peer } = setup({ db })

  await counter.handleChatMessage(sender, { clientId: 'client-1234-abcd', content: '并发重发' })

  assert.deepEqual(peer.sent, [])
  assert.deepEqual(sender.sent, [
    { type: 'chat_ack', clientId: 'client-1234-abcd', id: 'client-1234-abcd' },
  ])
  assert.equal(sender.deserializeAttachment().lastMessageAt, NOW)
})

test('未配置 Supabase 时不阻断发言', async t => {
  t.mock.method(Date, 'now', () => NOW)
  const db = createDb(async () => [])
  const { counter, sender, peer } = setup({
    db,
    env: { SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '' },
  })

  await counter.handleChatMessage(sender, { content: '吊销功能未启用时仍可发言' })

  assert.equal(peer.sent.filter(payload => payload.type === 'chat').length, 1)
})

test('服务端不再按贴纸清单拦截，新增贴纸无需重新部署', async t => {
  t.mock.method(Date, 'now', () => NOW)
  const db = createDb(async () => [])
  const { counter, sender, peer } = setup({ db })

  await counter.handleChatMessage(sender, { content: '[sticker:21]' })

  assert.equal(peer.sent.filter(payload => payload.type === 'chat').length, 1)
  assert.equal(peer.sent[0].message.content, '[sticker:21]')
})
