import { defineConfig } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  plugins: [svelte()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: {
    target: 'es2022',
    rollupOptions: { output: { manualChunks: { editor: ['@codemirror/view', '@codemirror/state', '@codemirror/lang-markdown'] } } },
  },
  test: { environment: 'jsdom', include: ['tests/**/*.test.ts'], css: true },
})
