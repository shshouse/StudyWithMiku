import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

const analyticsPlugin = () => {
  return {
    name: 'analytics-injector',
    transformIndexHtml: (html) => {
      const analyticsId = process.env.VITE_ANALYTICS_ID
      const analyticsUrl = process.env.VITE_ANALYTICS_URL
      if (!analyticsId || !analyticsUrl) return html
      const scriptTag = `<script defer src="${analyticsUrl}" data-website-id="${analyticsId}"></script>`
      return html.replace('</head>', `${scriptTag}</head>`)
    }
  }
}

export default defineConfig({
  plugins: [
    vue(),
    analyticsPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'favicon.svg', 'apple-touch-icon.png', 'robots.txt', '*.mp3', '*.mp4'],
      manifest: {
        name: 'Study with Miku - 初音未来主题自习室',
        short_name: 'Study with Miku',
        description: '在悠闲的音乐里和初音一起学习吧，沉浸式学习陪伴网站',
        theme_color: '#39c5bb',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        lang: 'zh-CN',
        categories: ['education', 'productivity'],
        icons: [
          {
            src: '/web-app-manifest-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/web-app-manifest-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/web-app-manifest-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable'
          },
          {
            src: '/web-app-manifest-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,mp3}'],
        maximumFileSizeToCacheInBytes: 100 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /\.mp4$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'video-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 30
              }
            }
          }
        ]
      }
    })
  ],
  base: process.env.NODE_ENV === 'production' ? './' : '/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        manualChunks: undefined
      }
    }
  },
  server: {
    port: 3000
  },
  publicDir: 'public',
  assetsInclude: ['**/*.mp4', '**/*.webm', '**/*.ogg'],
  optimizeDeps: {
    include: ['vue']
  }
})