import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  server: {
    proxy: {
      '/api/4chan': {
        target: 'https://a.4cdn.org',
        changeOrigin: true,
        rewrite: (requestPath) => {
          const url = new URL(requestPath, 'http://4leaf.local')
          const path = url.searchParams.get('path') ?? ''
          return path.startsWith('/') ? path : `/${path}`
        }
      }
    }
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.svg'],
      manifest: {
        name: '4leaf',
        short_name: '4leaf',
        description: 'A fast, private, installable 4chan reader.',
        theme_color: '#f7f3e8',
        background_color: '#f7f3e8',
        display: 'standalone',
        orientation: 'any',
        start_url: './',
        scope: './',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: /\/api\/4chan(?:\?|$)/i,
            handler: 'NetworkFirst',
            options: { cacheName: '4leaf-api', expiration: { maxEntries: 80, maxAgeSeconds: 1800 } }
          },
          {
            urlPattern: /^https:\/\/i\.4cdn\.org\/[a-z0-9]+\/\d+s\.jpg$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: '4leaf-thumbnails',
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 250, maxAgeSeconds: 604800 }
            }
          }
        ]
      }
    })
  ]
})
