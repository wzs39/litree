import { defineConfig } from 'vite'

export default defineConfig({
  root: 'src/renderer',
  // 相对 base：GitHub Pages 项目子路径（/litree/）可直接托管，hash 路由无需重写
  base: './',
  publicDir: '../../resources',
  build: {
    outDir: '../../dist',
    emptyOutDir: true
  },
  server: {
    port: 5173
  }
})
