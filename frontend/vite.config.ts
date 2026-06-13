import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// dev에서 nginx 없이 백엔드(uvicorn:8000)로 /api·/ws를 프록시한다.
// prod/onprem은 nginx가 라우팅하므로 이 설정은 dev 전용이다.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
      '/ws': { target: 'ws://localhost:8000', ws: true },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/vitest.setup.ts',
  },
})
