import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4000,
    proxy: {
      '/refresh': {
        target: 'http://localhost:8080',
        changeOrigin: true
      },
      '/history': {
        target: 'http://localhost:8080',
        changeOrigin: true
      },
      '/grid-search': {
        target: 'http://localhost:8080',
        changeOrigin: true
      },
      '/kama': {
        target: 'http://localhost:8080',
        changeOrigin: true
      },
      '/rsi': {
        target: 'http://localhost:8080',
        changeOrigin: true
      },
      '/rsi-grid-search': {
        target: 'http://localhost:8080',
        changeOrigin: true
      },
      '/ws': {
        target: 'ws://localhost:8080',
        ws: true
      }
    }
  }
})