<template>
  <div
    ref="containerRef"
    class="floating-todo"
    :class="{ dragging: isDragging, resizing: isResizing }"
    :style="containerStyle"
    @mouseenter="$emit('ui-enter')"
    @mouseleave="$emit('ui-leave')"
    @touchstart.stop="$emit('ui-enter')"
    @touchend.stop="$emit('ui-leave')"
  >
    <div
      class="floating-todo-header"
      @mousedown="onDragStart"
      @touchstart.prevent="onDragStart"
    >
      <div class="floating-todo-header-title">
        <span class="floating-todo-grip" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="9" cy="6" r="1.5"></circle>
            <circle cx="15" cy="6" r="1.5"></circle>
            <circle cx="9" cy="12" r="1.5"></circle>
            <circle cx="15" cy="12" r="1.5"></circle>
            <circle cx="9" cy="18" r="1.5"></circle>
            <circle cx="15" cy="18" r="1.5"></circle>
          </svg>
        </span>
        <span>待办便签＞﹏＜</span>
      </div>
      <button
        type="button"
        class="floating-todo-close"
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
    <transition-group name="ftodo" tag="div" class="floating-todo-body">
      <div v-for="todo in sortedTodos" :key="todo.id" class="floating-todo-item" :class="{ completed: todo.completed }">
        <button
          type="button"
          class="floating-todo-check"
          :class="{ done: todo.completed }"
          :title="todo.completed ? '标记为未完成' : '标记为完成'"
          :aria-label="todo.completed ? '标记为未完成' : '标记为完成'"
          @click="$emit('toggle', todo.id)"
        >
          <svg v-if="todo.completed" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </button>
        <div class="floating-todo-text">{{ todo.text }}</div>
      </div>
      <div v-if="todos.length === 0" key="empty" class="floating-todo-empty">暂无待办事项</div>
    </transition-group>
    <div
      class="floating-todo-resize-handle"
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

const props = defineProps({
  todos: { type: Array, default: () => [] },
})

const sortedTodos = computed(() => [
  ...props.todos.filter(t => !t.completed),
  ...props.todos.filter(t => t.completed),
])

defineEmits(['close', 'toggle', 'ui-enter', 'ui-leave'])

const STORAGE_KEY = 'study_floating_todo_layout'
const MIN_WIDTH = 260
const MIN_HEIGHT = 300
const DEFAULT_WIDTH = MIN_WIDTH
const DEFAULT_HEIGHT = MIN_HEIGHT
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
          Number.isFinite(parsed.x) ? parsed.x : window.innerWidth - size.width - MARGIN,
          Number.isFinite(parsed.y) ? parsed.y : window.innerHeight - size.height - MARGIN,
          size.width,
          size.height
        )
        return { ...pos, ...size }
      }
    }
  } catch (e) {
    console.warn('读取悬浮待办窗布局失败', e)
  }
  const size = clampSize(DEFAULT_WIDTH, DEFAULT_HEIGHT)
  const pos = clampPosition(
    window.innerWidth - size.width - MARGIN - 320,
    window.innerHeight - size.height - MARGIN,
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
    console.warn('保存悬浮待办窗布局失败', e)
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
.floating-todo {
  position: fixed;
  z-index: 1600;
  display: flex;
  flex-direction: column;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  overflow: hidden;
  color: white;
  user-select: none;
  transition: box-shadow 0.3s ease, border-color 0.3s ease;
}
.floating-todo.dragging,
.floating-todo.resizing {
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(57, 197, 187, 0.35);
}
.floating-todo-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
  padding: 0.55rem 0.75rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.15);
  cursor: move;
  touch-action: none;
}
.floating-todo-header-title {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
}
.floating-todo-grip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.45);
}
.floating-todo-close {
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
.floating-todo-close:hover {
  color: white;
  background: rgba(244, 67, 54, 0.25);
  border-color: rgba(244, 67, 54, 0.45);
}
.floating-todo-body {
  flex: 1;
  min-height: 0;
  padding: 0.85rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}
.floating-todo-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 10px;
  padding: 0.9rem 1rem;
  transition: all 0.3s ease;
}
.floating-todo-item:hover {
  background: rgba(255, 255, 255, 0.14);
  transform: translateX(4px);
}
.floating-todo-check {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  padding: 0;
  background: transparent;
  border-radius: 4px;
  border: 1.5px solid rgba(255, 255, 255, 0.35);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
}
.floating-todo-check:hover {
  border-color: #4ecdc4;
  transform: scale(1.1);
}
.floating-todo-check.done {
  background: #4ecdc4;
  border-color: #4ecdc4;
  color: white;
}
.floating-todo-item.completed {
  opacity: 0.55;
}
.floating-todo-item.completed .floating-todo-text {
  text-decoration: line-through;
  color: rgba(255, 255, 255, 0.5);
}
.floating-todo-text {
  font-size: 0.9rem;
  line-height: 1.5;
  opacity: 0.9;
  overflow-wrap: break-word;
}
.floating-todo-empty {
  text-align: center;
  padding: 2rem;
  opacity: 0.5;
  font-size: 0.85rem;
}
.ftodo-move { transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1); }
.ftodo-enter-active { transition: all 0.3s ease; }
.ftodo-leave-active { transition: all 0.3s ease; position: absolute; width: calc(100% - 1.7rem); }
.ftodo-enter-from { opacity: 0; transform: translateY(-8px); }
.ftodo-leave-to { opacity: 0; transform: translateX(16px); }
.floating-todo-body::-webkit-scrollbar {
  width: 6px;
}
.floating-todo-body::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 3px;
}
.floating-todo-body::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
}
.floating-todo-body::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}
.floating-todo-resize-handle {
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
.floating-todo-resize-handle:hover {
  color: rgba(255, 255, 255, 0.8);
}

@media (max-width: 640px) {
  .floating-todo { border-radius: 14px; }
  .floating-todo-header { padding: 0.5rem 0.65rem; }
}
</style>
