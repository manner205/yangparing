import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/naver-finance': {
        target: 'https://m.stock.naver.com',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/naver-finance/, '')
      }
    }
  }
})
