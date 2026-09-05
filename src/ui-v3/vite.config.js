import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// base 必须是 /static/:web_server 以 ws.Static("/static", htmlRoot) 托管静态资源,
// index.html 本身挂在 / 下,资产路径若不带 /static 前缀会被 NoRoute 劫持重定向到 404
export default defineConfig({
  base: '/static/',
  plugins: [vue()],
  server: {
    port: 9090,
    proxy: {
      '/api': {
        target: 'http://localhost:8090',
        changeOrigin: true
      }
    }
  },
  build: {
    chunkSizeWarningLimit: 1500
  }
})
