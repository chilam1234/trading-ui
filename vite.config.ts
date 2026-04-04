import babel from '@rolldown/plugin-babel'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { reactCompilerPreset } from './src/vite/reactCompilerPreset'

// https://vite.dev/config/
// React Compiler: https://react.dev/learn/react-compiler — requires @rolldown/plugin-babel + babel-plugin-react-compiler
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
  ],
  server: {
    proxy: {
      '/binance-api': {
        target: 'https://api.binance.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/binance-api/, ''),
      },
    },
  },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
})
