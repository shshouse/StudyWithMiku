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
      includeAssets: ['favicon.ico', 'robots.txt', '*.mp3', '*.mp4'],
      manifest: {
        name: '自用Miku学习室',
        short_name: 'Study with Miku',
        description: 'Miku，爽！',
        theme_color: '#39c5bb',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          {
            src: '/favicon.ico',
            sizes: '64x64 32x32 24x24 16x16',
            type: 'image/x-icon'
          },
          {
            src: '/favicon.ico',
            sizes: '192x192',
            type: 'image/x-icon'
          },
          {
            src: '/favicon.ico',
            sizes: '512x512',
            type: 'image/x-icon'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,mp3}'],
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
