<template>
  <div class="updates-container">
    <div class="updates-list">
      <div class="update-item">
        <div class="update-date">2026-1-2</div>
        <div class="update-content">
          <p>新年快乐！希望在新的一年大家可以继续Study With Miku~</p>
          <p>不知道大家的学习数据怎么样了，主包自己是77小时，大家可以在获取歌单id的文章下面晒出自己的学习数据截图喔~</p>
          <p>1.真正修复了手机端"全屏""切换"按钮显示问题，感谢@gxxk-dev的贡献</p>
          <p>2.为滚动条样式自定义了样式</p>
        </div>
      </div>
      <div class="update-item">
        <div class="update-date">2025-12-27</div>
        <div class="update-content">
          <p>学习辛苦了！也请注意一下休息哦~</p>
          <p>1.对默认歌单添加了翻译，找歌更方便~</p>
          <p>2.修复手机端的ui显示不全问题</p>
          <p>3.修复手机端的"全屏""切换"按钮显示问题</p>
        </div>
      </div>
      <div class="update-item">
        <div class="update-date">2025-12-19</div>
        <div class="update-content">
          <p>网站即将满月，感谢大家的使用!</p>
          <p>1.账号系统制作中，以后可以登录MikuMod账号，记录学习时长等</p>
          <p>2.学习时长记录推出！可以记录学习了多久以及完成的番茄数~</p>
          <p>3.桌面壁纸应用即将推出~</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
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
