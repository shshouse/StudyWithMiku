<template>
  <div
    ref="containerRef"
    class="floating-chat"
    :class="{ dragging: isDragging, resizing: isResizing }"
    :style="containerStyle"
    @mouseenter="$emit('ui-enter')"
    @mouseleave="$emit('ui-leave')"
    @touchstart.stop="$emit('ui-enter')"
    @touchend="$emit('ui-leave')"
  >
    <div
      class="floating-chat-header"
      @mousedown="onDragStart"
      @touchstart.prevent="onDragStart"
    >
      <div class="floating-chat-header-title">
        <span class="floating-chat-grip" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="9" cy="6" r="1.5"></circle>
            <circle cx="15" cy="6" r="1.5"></circle>
            <circle cx="9" cy="12" r="1.5"></circle>
            <circle cx="15" cy="12" r="1.5"></circle>
            <circle cx="9" cy="18" r="1.5"></circle>
            <circle cx="15" cy="18" r="1.5"></circle>
          </svg>
        </span>
        <span>聊天室</span>
      </div>
      <button
        type="button"
        class="floating-chat-close"
        title="关闭独立窗口"
        aria-label="关闭独立窗口"
        @mousedown.stop
        @touchstart.stop
        @click="$emit('close')"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
    <div class="floating-chat-body">
      <ChatPanel
        :messages="messages"
        :online-count="onlineCount"
        :is-connected="isConnected"
        :is-authenticated="isAuthenticated"
        :is-logged-in="isLoggedIn"
        :chat-error="chatError"
        :current-user-id="currentUserId"
        :send-message="sendMessage"
        :profiles="profiles"
        :show-popout="false"
        title="聊天室"
        subtitle="和正在学习的人打个招呼吧"
        @login="$emit('login')"
      />
    </div>
    <div
      class="floating-chat-resize-handle"
      @mousedown.prevent="onResizeStart"
      @touchstart.prevent="onResizeStart"
      title="拖动以调整大小"
      aria-label="调整大小"
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
        <line x1="11" y1="5" x2="5" y2="11"></line>
        <line x1="11" y1="9" x2="9" y2="11"></line>
      </svg>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import ChatPanel from './ChatPanel.vue'

defineProps({
  messages: { type: Array, default: () => [] },
  onlineCount: { type: Number, default: 0 },
  isConnected: { type: Boolean, default: false },
  isAuthenticated: { type: Boolean, default: false },
  isLoggedIn: { type: Boolean, default: false },
  chatError: { type: String, default: '' },
  currentUserId: { type: String, default: '' },
  sendMessage: { type: Function, required: true },
  profiles: { type: Object, default: () => ({}) },
})

defineEmits(['close', 'login', 'ui-enter', 'ui-leave'])

const STORAGE_KEY = 'study_floating_chat_layout'
const MIN_WIDTH = 300
const MIN_HEIGHT = 380
const DEFAULT_WIDTH = 380
const DEFAULT_HEIGHT = 560
const MARGIN = 12

const containerRef = ref(null)
const isDragging = ref(false)
const isResizing = ref(false)

const clampPosition = (x, y, width, height) => {
  const maxX = Math.max(MARGIN, window.innerWidth - width - MARGIN)
  const maxY = Math.max(MARGIN, window.innerHeight - height - MARGIN)
  return {
    x: Math.min(Math.max(MARGIN, x), maxX),
    y: Math.min(Math.max(MARGIN, y), maxY),
  }
}

const clampSize = (width, height) => ({
  width: Math.min(
    Math.max(MIN_WIDTH, width),
    Math.max(MIN_WIDTH, window.innerWidth - MARGIN * 2)
  ),
  height: Math.min(
    Math.max(MIN_HEIGHT, height),
    Math.max(MIN_HEIGHT, window.innerHeight - MARGIN * 2)
  ),
})

const loadLayout = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        const size = clampSize(
          Number(parsed.width) || DEFAULT_WIDTH,
          Number(parsed.height) || DEFAULT_HEIGHT
        )
        const pos = clampPosition(
          Number.isFinite(parsed.x) ? parsed.x : window.innerWidth - size.width - MARGIN * 2,
          Number.isFinite(parsed.y) ? parsed.y : window.innerHeight - size.height - MARGIN * 6,
          size.width,
          size.height
        )
        return { ...pos, ...size }
      }
    }
  } catch (e) {
    console.warn('读取悬浮聊天窗布局失败', e)
  }
  const size = clampSize(DEFAULT_WIDTH, DEFAULT_HEIGHT)
  const pos = clampPosition(
    window.innerWidth - size.width - MARGIN * 2,
    window.innerHeight - size.height - MARGIN * 6,
    size.width,
    size.height
  )
  return { ...pos, ...size }
}

const layout = ref(loadLayout())

const saveLayout = () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout.value))
  } catch (e) {
    console.warn('保存悬浮聊天窗布局失败', e)
  }
}

const containerStyle = computed(() => ({
  left: `${layout.value.x}px`,
  top: `${layout.value.y}px`,
  width: `${layout.value.width}px`,
  height: `${layout.value.height}px`,
}))

let dragOffset = { x: 0, y: 0 }
let resizeStart = { x: 0, y: 0, width: 0, height: 0 }

const getPointer = (e) => {
  if (e.touches && e.touches[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY }
  return { x: e.clientX, y: e.clientY }
}

const onDragStart = (e) => {
  if (e.button !== undefined && e.button !== 0) return
  const pointer = getPointer(e)
  dragOffset = { x: pointer.x - layout.value.x, y: pointer.y - layout.value.y }
  isDragging.value = true
  window.addEventListener('mousemove', onDragMove)
  window.addEventListener('mouseup', onDragEnd)
  window.addEventListener('touchmove', onDragMove, { passive: false })
  window.addEventListener('touchend', onDragEnd)
  window.addEventListener('touchcancel', onDragEnd)
}

const onDragMove = (e) => {
  if (!isDragging.value) return
  if (e.cancelable && e.touches) e.preventDefault()
  const pointer = getPointer(e)
  const clamped = clampPosition(
    pointer.x - dragOffset.x,
    pointer.y - dragOffset.y,
    layout.value.width,
    layout.value.height
  )
  layout.value = { ...layout.value, ...clamped }
}

const onDragEnd = () => {
  if (!isDragging.value) return
  isDragging.value = false
  window.removeEventListener('mousemove', onDragMove)
  window.removeEventListener('mouseup', onDragEnd)
  window.removeEventListener('touchmove', onDragMove)
  window.removeEventListener('touchend', onDragEnd)
  window.removeEventListener('touchcancel', onDragEnd)
  saveLayout()
}

const onResizeStart = (e) => {
  if (e.button !== undefined && e.button !== 0) return
  const pointer = getPointer(e)
  resizeStart = {
    x: pointer.x,
    y: pointer.y,
    width: layout.value.width,
    height: layout.value.height,
  }
  isResizing.value = true
  window.addEventListener('mousemove', onResizeMove)
  window.addEventListener('mouseup', onResizeEnd)
  window.addEventListener('touchmove', onResizeMove, { passive: false })
  window.addEventListener('touchend', onResizeEnd)
  window.addEventListener('touchcancel', onResizeEnd)
}

const onResizeMove = (e) => {
  if (!isResizing.value) return
  if (e.cancelable && e.touches) e.preventDefault()
  const pointer = getPointer(e)
  const nextSize = clampSize(
    resizeStart.width + (pointer.x - resizeStart.x),
    resizeStart.height + (pointer.y - resizeStart.y)
  )
  const clampedPos = clampPosition(layout.value.x, layout.value.y, nextSize.width, nextSize.height)
  layout.value = { ...clampedPos, ...nextSize }
}

const onResizeEnd = () => {
  if (!isResizing.value) return
  isResizing.value = false
  window.removeEventListener('mousemove', onResizeMove)
  window.removeEventListener('mouseup', onResizeEnd)
  window.removeEventListener('touchmove', onResizeMove)
  window.removeEventListener('touchend', onResizeEnd)
  window.removeEventListener('touchcancel', onResizeEnd)
  saveLayout()
}

const onWindowResize = () => {
  const nextSize = clampSize(layout.value.width, layout.value.height)
  const nextPos = clampPosition(layout.value.x, layout.value.y, nextSize.width, nextSize.height)
  layout.value = { ...nextPos, ...nextSize }
}

onMounted(() => {
  window.addEventListener('resize', onWindowResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', onWindowResize)
  window.removeEventListener('mousemove', onDragMove)
  window.removeEventListener('mouseup', onDragEnd)
  window.removeEventListener('touchmove', onDragMove)
  window.removeEventListener('touchend', onDragEnd)
  window.removeEventListener('touchcancel', onDragEnd)
  window.removeEventListener('mousemove', onResizeMove)
  window.removeEventListener('mouseup', onResizeEnd)
  window.removeEventListener('touchmove', onResizeMove)
  window.removeEventListener('touchend', onResizeEnd)
  window.removeEventListener('touchcancel', onResizeEnd)
})
</script>

<style scoped>
.floating-chat {
  position: fixed;
  z-index: 1600;
  display: flex;
  flex-direction: column;
  border-radius: 16px;
  background: rgba(18, 20, 26, 0.92);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.45), 0 2px 10px rgba(0, 0, 0, 0.35);
  overflow: hidden;
  color: white;
  user-select: none;
  transition: box-shadow 0.2s ease;
}
.floating-chat.dragging,
.floating-chat.resizing {
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(57, 197, 187, 0.35);
}
.floating-chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
  padding: 0.55rem 0.75rem;
  background: rgba(255, 255, 255, 0.04);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  cursor: move;
  touch-action: none;
}
.floating-chat-header-title {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
}
.floating-chat-grip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.45);
}
.floating-chat-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.7);
  background: transparent;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.2s ease;
}
.floating-chat-close:hover {
  color: white;
  background: rgba(244, 67, 54, 0.25);
  border-color: rgba(244, 67, 54, 0.45);
}
.floating-chat-body {
  flex: 1;
  min-height: 0;
  padding: 0.85rem;
  overflow: hidden;
  user-select: text;
}
.floating-chat-body :deep(.chat-container) {
  min-height: 0;
  height: 100%;
}
.floating-chat-body :deep(.chat-messages-wrapper) {
  min-height: 0;
  max-height: none;
  flex: 1;
}
.floating-chat-body :deep(.chat-messages) {
  min-height: 0;
  max-height: none;
  flex: 1;
}
.floating-chat-resize-handle {
  position: absolute;
  right: 2px;
  bottom: 2px;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  padding: 2px;
  color: rgba(255, 255, 255, 0.35);
  cursor: nwse-resize;
  touch-action: none;
  border-bottom-right-radius: 14px;
}
.floating-chat-resize-handle:hover {
  color: rgba(255, 255, 255, 0.8);
}

@media (max-width: 640px) {
  .floating-chat { border-radius: 14px; }
  .floating-chat-header { padding: 0.5rem 0.65rem; }
}
</style>
