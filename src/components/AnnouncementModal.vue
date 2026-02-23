<template>
  <transition name="modal-fade">
    <div v-if="showModal" class="announcement-overlay" @click.self="closeModal">
      <div class="announcement-modal">
        <div class="modal-content">
          <div class="content-area">
            <div class="announcement-detail">
              <h2>{{ latestUpdate.title || '最新更新' }}</h2>
              <div class="announcement-date">{{ latestUpdate.date }}</div>
              <div v-html="announcementContent" class="announcement-content"></div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="confirm-btn" @click="closeModal">开始学习！</button>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { updates } from '../data/updates.js'

const STORAGE_KEY = 'announcement_last_shown'
const INTERVAL_DAYS = 3

const showModal = ref(false)

const latestUpdate = computed(() => updates[0])

const announcementContent = computed(() => {
  const contentHtml = latestUpdate.value.content.map(item => `<p>${item}</p>`).join('')
  const imagesHtml = latestUpdate.value.images?.length
    ? `<div style="margin-top: 0.8rem; display: flex; flex-wrap: wrap; gap: 0.5rem;">${latestUpdate.value.images.map(img => `<img src="${img}" style="max-width: 100%; border-radius: 8px; border: 1px solid rgba(255,255,255,0.15);" />`).join('')}</div>`
    : ''
  return `
    ${contentHtml}
    ${imagesHtml}
    <p style="margin-top: 1rem; font-size: 0.9rem; opacity: 0.7;">更多更新日志请查看番茄钟设置中的"更新日志"标签页</p>
  `
})

const shouldShowAnnouncement = () => {
  const lastShown = localStorage.getItem(STORAGE_KEY)
  if (!lastShown) return true
  const daysPassed = (Date.now() - parseInt(lastShown)) / (1000 * 60 * 60 * 24)
  return daysPassed >= INTERVAL_DAYS
}

const closeModal = () => {
  showModal.value = false
  localStorage.setItem(STORAGE_KEY, Date.now().toString())
}

onMounted(() => {
  if (shouldShowAnnouncement()) {
    setTimeout(() => { showModal.value = true }, 500)
  }
})
</script>

<style scoped>
.announcement-overlay {
  position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
  background: rgba(0, 0, 0, 0.7); display: flex; justify-content: center;
  align-items: center; z-index: 2000;
}
.announcement-modal {
  background: rgba(255, 255, 255, 0.1); backdrop-filter: blur(30px);
  border-radius: 20px; border: 1px solid rgba(255, 255, 255, 0.2);
  width: 90%; max-width: 700px; height: 70vh; max-height: 90vh; overflow: hidden;
  display: flex; flex-direction: column;
}
.modal-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 1rem 1.5rem; border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  flex-shrink: 0;
}
.modal-header h3 { color: white; margin: 0; font-size: 1.1rem; }
.close-btn {
  background: none; border: none; color: white; font-size: 1.5rem;
  cursor: pointer; padding: 0.2rem; border-radius: 50%; width: 30px; height: 30px;
  display: flex; align-items: center; justify-content: center; transition: background 0.3s ease;
  flex-shrink: 0;
}
.close-btn:hover { background: rgba(255, 255, 255, 0.1); }
.modal-content {
  display: flex; flex: 1; overflow: hidden; min-height: 0;
}
.nav-sidebar {
  width: 180px; background: rgba(0, 0, 0, 0.2); border-right: 1px solid rgba(255, 255, 255, 0.1);
  display: flex; flex-direction: column; padding: 0.5rem 0;
  overflow-y: auto; flex-shrink: 0;
}
.nav-item {
  display: flex; align-items: center; padding: 1rem 1.2rem;
  cursor: pointer; transition: all 0.3s ease; border-radius: 8px;
  margin: 0.2rem 0.5rem; color: rgba(255, 255, 255, 0.7);
  white-space: nowrap;
}
.nav-item:hover { background: rgba(255, 255, 255, 0.1); color: white; }
.nav-item.active {
  background: rgba(41, 128, 185, 0.3); color: white;
  border: 1px solid rgba(41, 128, 185, 0.5);
}
.nav-text { font-size: 0.95rem; }
.content-area {
  flex: 1; padding: 1.5rem; overflow-y: auto;
}
.announcement-detail { animation: fadeIn 0.3s ease; }
.announcement-detail h2 {
  margin: 0 0 0.5rem 0; font-size: 1.4rem; color: white;
}
.updates-list { display: flex; flex-direction: column; gap: 1.5rem; }
.update-item {
  background: rgba(0, 0, 0, 0.2); border-radius: 12px;
  padding: 1.2rem; border: 1px solid rgba(255, 255, 255, 0.1);
}
.update-date {
  font-size: 0.9rem; color: rgba(41, 128, 185, 1);
  margin-bottom: 0.8rem; font-weight: 500;
}
.update-content { color: rgba(255, 255, 255, 0.8); line-height: 1.8; }
.update-content p { margin: 0.6rem 0; font-size: 0.9rem; }
.announcement-date {
  font-size: 0.85rem; color: rgba(255, 255, 255, 0.5);
  margin-bottom: 1.5rem; padding-bottom: 0.8rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}
.announcement-content { color: rgba(255, 255, 255, 0.8); line-height: 1.8; }
.announcement-content p { margin: 0.8rem 0; font-size: 0.95rem; }
.notice-link {
  display: inline-block; margin-top: 1rem; padding: 0.8rem 1.5rem;
  background: rgba(41, 128, 185, 0.5); border: 1px solid rgba(41, 128, 185, 0.8);
  color: white; text-decoration: none; border-radius: 8px; transition: all 0.3s ease; font-size: 0.9rem;
}
.notice-link:hover { background: rgba(41, 128, 185, 0.7); transform: translateY(-2px); }
.modal-footer { padding: 1rem 1.5rem; border-top: 1px solid rgba(255, 255, 255, 0.1); text-align: center; }
.confirm-btn {
  padding: 0.6rem 2rem; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.3);
  background: rgba(76, 175, 80, 0.3); color: white; font-size: 0.9rem;
  cursor: pointer; transition: all 0.3s ease;
}
.confirm-btn:hover { background: rgba(76, 175, 80, 0.5); }
.modal-fade-enter-active, .modal-fade-leave-active { transition: opacity 0.3s ease; }
.modal-fade-enter-from, .modal-fade-leave-to { opacity: 0; }
.content-fade-enter-active, .content-fade-leave-active { transition: all 0.3s ease; }
.content-fade-enter-from { opacity: 0; transform: translateX(20px); }
.content-fade-leave-to { opacity: 0; transform: translateX(-20px); }
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
