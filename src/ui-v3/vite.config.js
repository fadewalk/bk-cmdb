import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import fs from 'fs'
import path from 'path'

// base 必须是 /static/:web_server 以 ws.Static("/static", htmlRoot) 托管静态资源,
// index.html 本身挂在 / 下,资产路径若不带 /static 前缀会被 NoRoute 劫持重定向到 404
export default defineConfig({
  base: '/static/',
  plugins: [
    vue(),
    // 把 src/styles/bk-icon.css 字体路径重写为相对路径,
    // 同时把 public/icon-cmd 复制到 dist/assets/icon-cmd,这样 CSS 与字体同处一个目录
    {
      name: 'bk-icon-assets',
      apply: 'build',
      closeBundle() {
        const distAssets = path.resolve(__dirname, 'dist/assets')
        const srcIconCmd = path.resolve(__dirname, 'public/icon-cmd')
        const targetIconCmd = path.join(distAssets, 'icon-cmd')
        if (fs.existsSync(srcIconCmd) && !fs.existsSync(targetIconCmd)) {
          fs.cpSync(srcIconCmd, targetIconCmd, { recursive: true })
        }
        // 把 dist/assets/*.css 中所有 /icon-cmd/ 引用改为 ./icon-cmd/ (相对路径)
        if (fs.existsSync(distAssets)) {
          for (const f of fs.readdirSync(distAssets)) {
            if (!f.endsWith('.css')) continue
            const p = path.join(distAssets, f)
            let s = fs.readFileSync(p, 'utf8')
            s = s.replace(/url\((['"]?)\/icon-cmd\//g, 'url($1./icon-cmd/')
            s = s.replace(/url\((['"]?)icon-cmd\//g, 'url($1./icon-cmd/')
            fs.writeFileSync(p, s)
          }
        }
      }
    }
  ],
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
