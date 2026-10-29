import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves the app at https://<user>.github.io/<repo>/. The deploy workflow sets BASE_PATH.
const BASE_PATH = process.env.BASE_PATH ?? '/fuel-log/';

export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? BASE_PATH : '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'icon.svg'],
      manifest: {
        name: 'Fuel Log',
        short_name: 'Fuel Log',
        description: 'Gamified calorie and protein tracker for bulking.',
        theme_color: '#14110E',
        background_color: '#14110E',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // Long-press the app icon (Android, desktop Chrome). Hash routes, handled by Food and Today.
        shortcuts: [
          { name: 'Add food', short_name: 'Add food', url: './#/food', icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }] },
          { name: 'Scan barcode', short_name: 'Scan', url: './#/food?open=scan', icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }] },
          { name: 'Add a glass of water', short_name: 'Water', url: './#/today?add=water', icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }] },
        ],
      },
      workbox: { importScripts: ['sw-extra.js'], globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,wasm}'], maximumFileSizeToCacheInBytes: 4_000_000 },
    }),
  ],
  test: { include: ['tests/**/*.test.ts'] },
}));
