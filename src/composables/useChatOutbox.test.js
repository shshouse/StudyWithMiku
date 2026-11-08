import assert from 'node:assert/strict'
import test from 'node:test'

const store = new Map()
globalThis.localStorage = {
  getItem: key => store.has(key) ? store.get(key) : null,
  setItem: (key, value) => {
    store.set(key, String(value))
  },
  removeItem: key => {
    store.delete(key)
  },
  clear: () => store.clear(),
}

const { useChatOutbox } = await import('./useChatOutbox.js')

const createOutbox = (sent, overrides = {}) => useChatOutbox({
  currentUserId: () => 'user-1',
  canSend: () => true,
  send: payload => {
    sent.push(payload)
    return true
  },
  ...overrides,
})

test('a message leaves the outbox only after the server confirms it', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  store.clear()
  const sent = []
  const outbox = createOutbox(sent)

  assert.equal(outbox.enqueue('你好'), true)
  assert.equal(sent.length, 1)
  assert.equal(sent[0].type, 'chat')
  assert.equal(sent[0].content, '你好')
  assert.deepEqual(outbox.pendingMessages.value.map(item => item.status), ['sending'])

  outbox.confirm(sent[0].clientId)

  assert.deepEqual(outbox.pendingMessages.value, [])
})

test('a lost ack resends the same message instead of a second one', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  store.clear()
  const sent = []
  const outbox = createOutbox(sent)

  outbox.enqueue('超时重发')
  t.mock.timers.tick(10000)

  assert.equal(sent.length, 2)
  assert.equal(sent[1].clientId, sent[0].clientId)
})

test('an unsent message survives a reload', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  store.clear()
  const offline = createOutbox([], { canSend: () => false, send: () => false })

  offline.enqueue('离线时写的消息')

  const sent = []
  const reloaded = createOutbox(sent)

  assert.equal(sent.length, 0)
  assert.equal(reloaded.pendingMessages.value.length, 1)
  reloaded.handleReady()
  assert.equal(sent.length, 1)
  assert.equal(sent[0].content, '离线时写的消息')
})

test('a message that never gets confirmed goes back to the input', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  store.clear()
  const sent = []
  const outbox = createOutbox(sent)

  outbox.enqueue('发不出去')
  t.mock.timers.tick(10000)
  t.mock.timers.tick(10000)
  t.mock.timers.tick(10000)

  assert.equal(sent.length, 3)
  assert.deepEqual(outbox.pendingMessages.value, [])
  assert.deepEqual(outbox.failedDrafts.value.map(item => item.content), ['发不出去'])
  assert.deepEqual(JSON.parse(store.get('chat_outbox_v1')), [])
})

test('a rate limited message waits and is sent again', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  store.clear()
  const sent = []
  const outbox = createOutbox(sent)

  outbox.enqueue('被限速的消息')
  outbox.handleSendError(sent[0].clientId, 'rate_limited', '发送太频繁了')
  assert.deepEqual(outbox.pendingMessages.value.map(item => item.status), ['pending'])

  t.mock.timers.tick(1600)

  assert.equal(sent.length, 2)
  assert.equal(sent[1].clientId, sent[0].clientId)
})

test('a server without ack support gets a single send and no retry', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  store.clear()
  const sent = []
  const outbox = createOutbox(sent, { canRetry: () => false })

  outbox.enqueue('老服务端没有 ack')

  assert.equal(sent.length, 1)
  assert.deepEqual(outbox.pendingMessages.value, [])

  t.mock.timers.tick(10000)

  assert.equal(sent.length, 1)
})
