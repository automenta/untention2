/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA, VitePWAOptions } from 'vite-plugin-pwa'

const pwaOptions: Partial<VitePWAOptions> = {
  registerType: 'autoUpdate',
  devOptions: {
    enabled: true, // Enable PWA in development
  },
  manifest: { // This will merge with /public/manifest.json
    name: 'Notention',
    short_name: 'Notention',
    description: 'A streamlined, powerful notebook app integrating LM capabilities.',
    theme_color: '#0d47a1', // Example theme color
    background_color: '#ffffff',
    icons: [
      {
        src: 'icons/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: 'icons/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: 'icons/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any maskable', // 'any maskable' is more common than 'any maskable purpose'
      },
    ],
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'], // Cache these file types
    navigateFallback: 'index.html', // For SPA routing offline
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'google-fonts-googleapis', // Specific cache name
          expiration: {
            maxEntries: 10,
            maxAgeSeconds: 60 * 60 * 24 * 365, // 365 days
          },
          cacheableResponse: {
            statuses: [0, 200],
          },
        },
      },
      {
        urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'google-fonts-gstatic', // Specific cache name
          expiration: {
            maxEntries: 10,
            maxAgeSeconds: 60 * 60 * 24 * 365, // 365 days
          },
          cacheableResponse: {
            statuses: [0, 200],
          },
        },
      },
      {
        urlPattern: /^https:\/\/.*\.(?:png|jpg|jpeg|svg|gif|webp)$/i, // General pattern for image URLs
        handler: 'CacheFirst',
        options: {
          cacheName: 'nostr-profile-images',
          expiration: {
            maxEntries: 60, // Cache up to 60 images
            maxAgeSeconds: 60 * 60 * 24 * 30, // Cache for 30 days
          },
          cacheableResponse: {
            statuses: [0, 200], // 0 for opaque responses (CORS)
          },
        },
      },
    ],
  }
}


// https://vitejs.dev/config/
export default defineConfig({
  base: '/untention2/', // Set the base path for GitHub Pages deployment
  plugins: [
    react(),
    VitePWA(pwaOptions)
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/tests/setup.ts', // Optional: if you need global setup
  }
})
