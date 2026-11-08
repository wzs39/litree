import { defineConfig } from 'vite'

export default defineConfig({
  root: 'src/renderer',
  publicDir: '../../resources',
  build: {
    outDir: '../../dist',
    emptyOutDir: true
  },
  server: {
    port: 5173
  }
})
