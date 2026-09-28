import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { offlineApp } from './pwa.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), offlineApp()],
  define: { 'import.meta.env.VITE_BUILD_ID': JSON.stringify(new Date().toISOString()) },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/vitest.setup.ts'],
    globals: true,
  },
})
