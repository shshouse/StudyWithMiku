const trackers = [
  { url: import.meta.env.VITE_T1 },
  { url: import.meta.env.VITE_T2, init: import.meta.env.VITE_T2_INIT },
  { url: import.meta.env.VITE_T3 },
]
for (const t of trackers) {
  if (!t.url) continue
  const script = document.createElement('script')
  script.async = true
  script.src = t.url
  if (t.init) {
    script.onload = () => {
      try { new Function(t.init)() } catch (e) {}
    }
  }
  document.head.appendChild(script)
}

if (window.location.pathname!=='/'&&!window.location.pathname.includes('.')){
  window.location.replace('/')//自动回根！
}
import { createApp } from 'vue'
import App from './App.vue'
import './style.css'

createApp(App).mount('#app')