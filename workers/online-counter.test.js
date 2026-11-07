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

function createSocket(onSend) {
  let attachment = {
    userId: 'user-1',
    username: '测试用户',
    authenticated: true,
    lastMessageAt: 0,
    lastHistoryLoadAt: 0,
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

function createDb(runBatch = async () => []) {
  const batches = []

  return {
    batches,
    prepare: sql => ({
      bind: (...args) => ({ sql, args }),
    }),
    batch: async statements => {
      batches.push(statements)
      return runBatch(statements)
    },
  }
}

function setup({ db, onSend } = {}) {
  const sender = createSocket(payload => onSend?.('sender', payload))
  const peer = createSocket(payload => onSend?.('peer', payload))
  const counter = new OnlineCounter(
    { getWebSockets: () => [sender, peer] },
    { STUDY_JWT_SECRET: 'test-secret', CHAT_DB: db },
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
