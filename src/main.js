if (window.location.pathname!=='/'&&!window.location.pathname.includes('.')){
  window.location.replace('/')//自动回根！
}
import { createApp } from 'vue'
import App from './App.vue'
import './style.css'

createApp(App).mount('#app')