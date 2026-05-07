<template>
  <div class="chat-container">
    <button
      v-if="showPopout"
      type="button"
      class="chat-popout-floating-btn"
      :title="popoutActive ? '已在独立窗口显示（点此收回）' : '独立窗口显示'"
      :aria-label="popoutActive ? '收回聊天窗口' : '独立窗口显示'"
      @click="$emit('popout')"
    >
      <svg v-if="!popoutActive" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M15 3h6v6"></path>
        <path d="M10 14 21 3"></path>
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
      </svg>
      <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
        <polyline points="16 17 21 12 16 7"></polyline>
        <line x1="21" y1="12" x2="9" y2="12"></line>
      </svg>
    </button>
    <div class="chat-messages-wrapper">
      <div ref="chatMessagesRef" class="chat-messages" @scroll.passive="handleScroll">
        <div v-if="hasMore" class="chat-history-status">
          <button
            v-if="!isLoadingMore"
            type="button"
            class="chat-load-more-btn"
            @click="triggerLoadMore"
          >加载更早的消息</button>
          <span v-else class="chat-history-loading">
            <span class="chat-history-spinner" aria-hidden="true"></span>
            正在加载历史消息...
          </span>
        </div>
        <div v-else-if="messages.length > 0" class="chat-history-status chat-history-end">已经到顶啦</div>
        <div v-if="messages.length === 0" class="chat-empty">暂无消息，开始第一句聊天吧</div>
        <div
          v-for="message in messages"
          :key="message.id"
          :data-mid="message.id"
          class="chat-message"
          :class="{ own: message.userId && message.userId === currentUserId }"
        >
          <div
            class="chat-avatar"
            :class="{ 'has-image': hasAvatarImage(message) }"
            :style="hasAvatarImage(message) ? null : { background: getAvatarColor(getAvatarSeed(message)) }"
            :aria-label="resolveUsername(message) || '游客'"
          >
            <img
              v-if="hasAvatarImage(message)"
              :src="getAvatarUrl(message)"
              :alt="resolveUsername(message) || '游客'"
              loading="lazy"
              decoding="async"
              referrerpolicy="no-referrer"
              @error="onAvatarLoadError(getAvatarFailureKey(message))"
            />
            <span v-else>{{ getAvatarInitial(message) }}</span>
          </div>
          <div class="chat-message-bubble">
            <div class="chat-message-meta">
              <span class="chat-message-name">{{ message.username || '游客' }}</span>
              <span class="chat-message-time">{{ formatChatTime(message.createdAt) }}</span>
            </div>
            <div class="chat-message-content">{{ message.content }}</div>
          </div>
        </div>
      </div>
      <transition name="chat-jump-fade">
        <button
          v-if="showJumpToBottom"
          type="button"
          class="chat-jump-to-bottom"
          @click="jumpToBottom"
          aria-label="回到最新消息"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
          <span>{{ unreadCount > 0 ? `${Math.min(unreadCount, 99)} 条新消息` : '回到底部' }}</span>
        </button>
      </transition>
    </div>
    <div v-if="chatError" class="chat-error">{{ chatError }}</div>
    <form class="chat-form" @submit.prevent="submit">
      <input
        v-model="chatInput"
        class="chat-input"
        type="text"
        maxlength="500"
        :placeholder="isLoggedIn ? '输入消息...' : '登录后可以发言'"
        :disabled="!isConnected || !isLoggedIn || !isAuthenticated"
      />
      <button
        class="action-btn chat-send-btn"
        type="submit"
        :disabled="!isConnected || !isLoggedIn || !isAuthenticated || !chatInput.trim()"
      >发送</button>
    </form>
    <div v-if="!isLoggedIn" class="chat-login-tip">
      <span>登录 MikuMod 账号后可以参与聊天</span>
      <button class="action-btn login-btn" @click="$emit('login')">登录</button>
    </div>
    <div v-else-if="!isAuthenticated" class="chat-login-tip">
      <span>正在验证聊天身份...</span>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'

const props = defineProps({
  messages: { type: Array, default: () => [] },
  onlineCount: { type: Number, default: 0 },
  isConnected: { type: Boolean, default: false },
  isAuthenticated: { type: Boolean, default: false },
  isLoggedIn: { type: Boolean, default: false },
  chatError: { type: String, default: '' },
  currentUserId: { type: String, default: '' },
  sendMessage: { type: Function, required: true },
  showPopout: { type: Boolean, default: true },
  popoutActive: { type: Boolean, default: false },
  profiles: { type: Object, default: () => ({}) },
  title: { type: String, default: 'StudyWithMiku' },
  subtitle: { type: String, default: '和正在学习的人打个招呼吧' },
  hasMore: { type: Boolean, default: false },
  isLoadingMore: { type: Boolean, default: false },
  loadMore: { type: Function, default: null },
})

defineEmits(['login', 'popout'])

const SCROLL_STORAGE_KEY = 'study_chat_scroll_position'
const SCROLL_BOTTOM_THRESHOLD = 60
const SCROLL_SAVE_DEBOUNCE = 300

const AVATAR_COLORS = [
  '#f94144', '#f3722c', '#f8961e', '#f9c74f',
  '#90be6d', '#43aa8b', '#4d908e', '#577590',
  '#277da1', '#9d4edd', '#c9184a', '#06aed5',
  '#ef476f', '#118ab2', '#ff6b6b', '#2ec4b6',
]

const chatInput = ref('')
const chatMessagesRef = ref(null)
const autoScrollPending = ref(true)
const isReady = ref(false)
const unreadCount = ref(0)
const avatarLoadFailures = reactive(new Set())

const showJumpToBottom = computed(() => isReady.value && !autoScrollPending.value)

const formatChatTime = (value) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
}

const getAvatarSeed = (message) => String(message.userId || message.username || 'guest')

const getAvatarColor = (seed) => {
  const key = String(seed || '')
  if (!key) return AVATAR_COLORS[0]
  let hash = 0
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) - hash) + key.charCodeAt(i)
    hash |= 0
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

const resolveUsername = (message) => {
  const fromProfile = message.userId ? props.profiles[message.userId]?.username : null
  return (message.username || fromProfile || '').trim()
}

const getAvatarInitial = (message) => {
  const name = resolveUsername(message)
  if (!name) return '游'
  const firstChar = Array.from(name)[0] || ''
  return firstChar.toUpperCase()
}

const getAvatarFailureKey = (message) => {
  // Distinguish per-message embedded avatar (frozen at send time) from
  // the live profile avatar so a stale URL on one old message doesn't
  // suppress a working avatar on a newer one or vice versa.
  if (typeof message.avatarUrl === 'string' && message.avatarUrl) {
    return `msg:${message.id || message.avatarUrl}`
  }
  return message.userId ? `user:${message.userId}` : ''
}

const getAvatarUrl = (message) => {
  const embedded = typeof message.avatarUrl === 'string' ? message.avatarUrl : ''
  if (embedded && !avatarLoadFailures.has(`msg:${message.id || embedded}`)) {
    return embedded
  }
  if (message.userId && !avatarLoadFailures.has(`user:${message.userId}`)) {
    const profile = props.profiles[message.userId]
    if (profile && typeof profile.avatar_url === 'string' && profile.avatar_url) {
      return profile.avatar_url
    }
  }
  return ''
}

const hasAvatarImage = (message) => !!getAvatarUrl(message)

const onAvatarLoadError = (failureKey) => {
  if (failureKey) avatarLoadFailures.add(failureKey)
}

const isAtBottom = () => {
  const el = chatMessagesRef.value
  if (!el) return true
  return el.scrollHeight - el.scrollTop - el.clientHeight <= SCROLL_BOTTOM_THRESHOLD
}

const scrollChatToBottom = async () => {
  await nextTick()
  const el = chatMessagesRef.value
  if (el) el.scrollTop = el.scrollHeight
}

const jumpToBottom = () => {
  const el = chatMessagesRef.value
  if (!el) return
  el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  autoScrollPending.value = true
  unreadCount.value = 0
}

let scrollSaveTimer = null
const saveScrollPosition = () => {
  const el = chatMessagesRef.value
  if (!el) return
  try {
    if (isAtBottom()) {
      localStorage.removeItem(SCROLL_STORAGE_KEY)
    } else {
      localStorage.setItem(
        SCROLL_STORAGE_KEY,
        JSON.stringify({ scrollTop: el.scrollTop, savedAt: Date.now() })
      )
    }
  } catch {}
}

const SCROLL_TOP_TRIGGER = 60

const triggerLoadMore = () => {
  if (typeof props.loadMore !== 'function') return
  if (props.isLoadingMore || !props.hasMore) return
  props.loadMore()
}

let previousScrollTop = Infinity

const handleScroll = () => {
  if (!isReady.value) return
  const el = chatMessagesRef.value
  if (!el) return
  const currentScrollTop = el.scrollTop
  const atBottom = isAtBottom()
  autoScrollPending.value = atBottom
  if (atBottom) unreadCount.value = 0
  if (scrollSaveTimer) clearTimeout(scrollSaveTimer)
  scrollSaveTimer = setTimeout(saveScrollPosition, SCROLL_SAVE_DEBOUNCE)
  // Auto-load older messages only when the user actively scrolls UP near the top.
  // Comparing to previousScrollTop prevents spurious triggers from programmatic
  // scrolls (e.g. initial scroll-to-bottom on a viewport taller than the content).
  if (
    currentScrollTop <= SCROLL_TOP_TRIGGER &&
    currentScrollTop < previousScrollTop &&
    props.hasMore &&
    !props.isLoadingMore
  ) {
    triggerLoadMore()
  }
  previousScrollTop = currentScrollTop
}

const restoreScrollPosition = async () => {
  await nextTick()
  const el = chatMessagesRef.value
  if (!el) {
    isReady.value = true
    return
  }
  try {
    const raw = localStorage.getItem(SCROLL_STORAGE_KEY)
    if (raw) {
      const saved = JSON.parse(raw)
      if (saved && Number.isFinite(saved.scrollTop)) {
        const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight)
        el.scrollTop = Math.min(Math.max(0, saved.scrollTop), maxScroll)
        autoScrollPending.value = isAtBottom()
        isReady.value = true
        return
      }
    }
  } catch {}
  el.scrollTop = el.scrollHeight
  autoScrollPending.value = true
  isReady.value = true
}

const submit = () => {
  const content = chatInput.value.trim()
  if (!content) return
  if (props.sendMessage(content)) {
    chatInput.value = ''
    autoScrollPending.value = true
    unreadCount.value = 0
    scrollChatToBottom()
  }
}

onMounted(() => {
  restoreScrollPosition()
})

onUnmounted(() => {
  if (scrollSaveTimer) {
    clearTimeout(scrollSaveTimer)
    scrollSaveTimer = null
  }
  saveScrollPosition()
})

// Track the oldest message identity so we can detect "older messages were
// prepended" (history paging) vs "newer messages appended" (live chat).
const getOldestMessageId = () => (props.messages.length ? props.messages[0].id : '')
let lastOldestId = getOldestMessageId()
let scrollAnchor = null // { topId, offsetWithinElement } captured before DOM update

watch(
  () => props.messages,
  (newList, oldList = []) => {
    const newLen = newList.length
    const oldLen = oldList.length
    const newOldestId = newLen ? newList[0].id : ''
    const olderPrepended = !!lastOldestId && newOldestId && newOldestId !== lastOldestId
      && newList.some(m => m.id === lastOldestId) && newLen > oldLen

    if (!isReady.value) {
      lastOldestId = newOldestId
      return
    }

    if (olderPrepended) {
      // Capture the previous top message's element offset before DOM rerenders
      const el = chatMessagesRef.value
      if (el) {
        const anchorEl = el.querySelector(`[data-mid="${CSS.escape(lastOldestId)}"]`)
        scrollAnchor = anchorEl
          ? { id: lastOldestId, prevOffset: anchorEl.offsetTop, prevScrollTop: el.scrollTop }
          : null
      }
    }

    nextTick().then(() => {
      const el = chatMessagesRef.value
      if (olderPrepended && el && scrollAnchor) {
        const anchorEl = el.querySelector(`[data-mid="${CSS.escape(scrollAnchor.id)}"]`)
        if (anchorEl) {
          const delta = anchorEl.offsetTop - scrollAnchor.prevOffset
          el.scrollTop = scrollAnchor.prevScrollTop + delta
        }
        scrollAnchor = null
      } else if (autoScrollPending.value) {
        if (el) el.scrollTop = el.scrollHeight
        unreadCount.value = 0
      } else if (newLen > oldLen && !olderPrepended) {
        unreadCount.value += newLen - oldLen
      }
      lastOldestId = newOldestId
    })
  },
  { deep: false }
)

defineExpose({ scrollChatToBottom, jumpToBottom })
</script>

<style scoped>
.chat-container {
  color: white;
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  min-height: 420px;
  height: 100%;
  position: relative;
}
.chat-popout-floating-btn {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  z-index: 5;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  opacity: 0.65;
  transition: opacity 0.2s ease, background 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}
.chat-popout-floating-btn:hover {
  opacity: 1;
  background: rgba(57, 197, 187, 0.2);
  border-color: rgba(57, 197, 187, 0.45);
  color: white;
}
.chat-popout-floating-btn:focus-visible {
  outline: 2px solid rgba(57, 197, 187, 0.6);
  outline-offset: 2px;
}
.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
}
.chat-heading { min-width: 0; }
.chat-title { font-size: 1rem; font-weight: 600; margin-bottom: 0.25rem; }
.chat-subtitle { font-size: 0.78rem; color: rgba(255, 255, 255, 0.6); }
.chat-header-actions {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}
.chat-presence {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.65rem;
  border-radius: 999px;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.75);
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
}
.chat-presence.connected {
  color: rgba(144, 238, 144, 0.95);
  border-color: rgba(76, 175, 80, 0.35);
  background: rgba(76, 175, 80, 0.12);
}
.chat-presence-dot { width: 7px; height: 7px; border-radius: 50%; background: #777; }
.chat-presence.connected .chat-presence-dot {
  background: #4caf50;
  box-shadow: 0 0 8px rgba(76, 175, 80, 0.6);
}
.chat-popout-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.78);
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  cursor: pointer;
  transition: all 0.2s ease;
}
.chat-popout-btn:hover {
  color: rgba(255, 255, 255, 0.95);
  background: rgba(57, 197, 187, 0.2);
  border-color: rgba(57, 197, 187, 0.4);
}
.chat-messages-wrapper {
  position: relative;
  flex: 1 1 auto;
  min-height: 230px;
  max-height: 42vh;
  display: flex;
}
.chat-messages {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0.8rem;
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  background: rgba(0, 0, 0, 0.18);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
}
.chat-messages::-webkit-scrollbar { width: 6px; }
.chat-messages::-webkit-scrollbar-track { background: rgba(255, 255, 255, 0.05); border-radius: 3px; }
.chat-messages::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.2); border-radius: 3px; }
.chat-empty { margin: auto; text-align: center; font-size: 0.85rem; color: rgba(255, 255, 255, 0.45); }
.chat-history-status {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 0.35rem 0;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.55);
}
.chat-history-end { color: rgba(255, 255, 255, 0.35); }
.chat-history-loading {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  color: rgba(255, 255, 255, 0.65);
}
.chat-history-spinner {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-top-color: rgba(57, 197, 187, 0.85);
  animation: chat-spin 0.8s linear infinite;
}
@keyframes chat-spin {
  to { transform: rotate(360deg); }
}
.chat-load-more-btn {
  padding: 0.3rem 0.85rem;
  border-radius: 999px;
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.85);
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.18);
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease;
}
.chat-load-more-btn:hover {
  background: rgba(57, 197, 187, 0.2);
  border-color: rgba(57, 197, 187, 0.4);
}
.chat-message {
  display: flex;
  gap: 0.55rem;
  align-items: flex-start;
  align-self: flex-start;
  max-width: 92%;
}
.chat-message.own {
  align-self: flex-end;
  flex-direction: row-reverse;
}
.chat-avatar {
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 0.85rem;
  font-weight: 600;
  line-height: 1;
  user-select: none;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.18);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.28);
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.25);
}
.chat-avatar.has-image {
  background: rgba(255, 255, 255, 0.08);
  text-shadow: none;
}
.chat-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.chat-message-bubble {
  min-width: 0;
  padding: 0.6rem 0.75rem;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.1);
}
.chat-message.own .chat-message-bubble {
  background: rgba(57, 197, 187, 0.18);
  border-color: rgba(57, 197, 187, 0.3);
}
.chat-message-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.3rem;
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.5);
}
.chat-message.own .chat-message-meta { justify-content: flex-end; }
.chat-message-name {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: rgba(255, 255, 255, 0.78);
}
.chat-message-time { flex-shrink: 0; }
.chat-message-content {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
  line-height: 1.5;
  font-size: 0.9rem;
}
.chat-jump-to-bottom {
  position: absolute;
  left: 50%;
  bottom: 10px;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.85rem;
  border-radius: 999px;
  font-size: 0.75rem;
  color: #fff;
  background: rgba(57, 197, 187, 0.88);
  border: 1px solid rgba(57, 197, 187, 0.95);
  cursor: pointer;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.28);
  transition: transform 0.2s ease, background 0.2s ease, opacity 0.2s ease;
  z-index: 2;
}
.chat-jump-to-bottom:hover { background: rgba(57, 197, 187, 1); transform: translateX(-50%) translateY(-1px); }
.chat-jump-fade-enter-active, .chat-jump-fade-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.chat-jump-fade-enter-from, .chat-jump-fade-leave-to { opacity: 0; transform: translateX(-50%) translateY(6px); }
.chat-jump-fade-enter-to, .chat-jump-fade-leave-from { opacity: 1; transform: translateX(-50%) translateY(0); }
.chat-error {
  padding: 0.55rem 0.7rem;
  border-radius: 8px;
  font-size: 0.78rem;
  color: rgba(255, 210, 210, 0.95);
  background: rgba(244, 67, 54, 0.16);
  border: 1px solid rgba(244, 67, 54, 0.28);
}
.chat-form { display: flex; gap: 0.6rem; align-items: center; }
.chat-input {
  flex: 1;
  min-width: 0;
  padding: 0.65rem 0.85rem;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  color: white;
  font-size: 0.9rem;
  transition: all 0.3s ease;
}
.chat-input:focus {
  outline: none;
  border-color: rgba(57, 197, 187, 0.55);
  background: rgba(255, 255, 255, 0.12);
  box-shadow: 0 0 0 3px rgba(57, 197, 187, 0.08);
}
.chat-input::placeholder { color: rgba(255, 255, 255, 0.4); }
.chat-input:disabled { opacity: 0.55; cursor: not-allowed; }
.action-btn {
  padding: 0.4rem 0.8rem;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.1);
  color: white;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.3s ease;
}
.action-btn:hover { background: rgba(255, 255, 255, 0.2); }
.chat-send-btn {
  flex-shrink: 0;
  padding: 0.65rem 1rem;
  background: rgba(57, 197, 187, 0.3);
  border-color: rgba(57, 197, 187, 0.5);
}
.chat-send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.login-btn {
  background: rgba(57, 197, 187, 0.3);
  border-color: rgba(57, 197, 187, 0.5);
  width: auto;
  padding: 0.5rem 1.5rem;
}
.login-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.chat-login-tip {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.8rem;
  padding: 0.75rem 0.9rem;
  border-radius: 10px;
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.7);
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

@media (max-width: 768px) {
  .chat-container { min-height: 360px; }
  .chat-header { flex-direction: column; align-items: flex-start; gap: 0.75rem; }
  .chat-header-actions { align-self: flex-end; }
  .chat-messages-wrapper { min-height: 220px; max-height: 38vh; }
  .chat-form { flex-direction: column; align-items: stretch; }
  .chat-send-btn { width: 100%; }
  .chat-login-tip { flex-direction: column; align-items: stretch; }
}
</style>
