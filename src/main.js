const trackers = [
  { url: import.meta.env.VITE_T1, stub: import.meta.env.VITE_T1_STUB },
  { url: import.meta.env.VITE_T2, init: import.meta.env.VITE_T2_INIT },
  { url: import.meta.env.VITE_T3 },
  { url: import.meta.env.VITE_T4 },
]
for (const t of trackers) {
  if (!t.url) continue
  if (t.stub) {
    try { new Function(t.stub)() } catch (e) {}
  }
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

const base = import.meta.env.BASE_URL || '/'
const normalizedBase = base.endsWith('/') ? base : `${base}/`
const currentPath = window.location.pathname
if (!currentPath.includes('.') && currentPath !== normalizedBase && `${currentPath}/` !== normalizedBase) {
  window.location.replace(normalizedBase)//自动回根！
}
import { createApp } from 'vue'
import App from './App.vue'
import './style.css'

createApp(App).mount('#app')