<template>
  <div class="updates-container">
    <div class="updates-list">
      <div v-for="update in updates" :key="update.date" class="update-item">
        <div class="update-date">{{ update.date }}</div>
        <div class="update-content">
          <p v-for="(item, index) in update.content" :key="index">{{ item }}</p>
        </div>
        <div v-if="update.images?.length" class="update-images">
          <img v-for="(img, i) in update.images" :key="i" :src="img" class="update-img" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { updates } from '../data/updates.js'
</script>

<style scoped>
.updates-container {
  color: white;
  padding: 1rem 0;
}

.updates-list {
  max-width: 600px;
  margin: 0 auto;
}

.update-item {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  padding: 1.5rem;
  margin-bottom: 1rem;
}

.update-date {
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 0.8rem;
  font-weight: 500;
}

.update-content p {
  margin-bottom: 0.5rem;
  font-size: 0.9rem;
  line-height: 1.5;
  opacity: 0.9;
}

.update-images {
  margin-top: 0.8rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.update-img {
  max-width: 100%;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.15);
}

.updates-container::-webkit-scrollbar {
  width: 6px;
}

.updates-container::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 3px;
}

.updates-container::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
}

.updates-container::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}
</style>
