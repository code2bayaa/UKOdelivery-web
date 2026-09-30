import { defineConfig } from 'vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// UKO delivery — rider web-app, single-page app (no SSR) on http://localhost:3014
export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), viteReact(), tailwindcss()],
  // src/components/map.tsx hands maplibre its tile worker through `?worker&url`, and maplibre starts it
  // with `{ type: 'module' }`. Vite's default worker format is iife, so say es here or the worker is a
  // classic script loaded as a module — see the comment at that import for why it is wired up at all.
  worker: { format: 'es' },
  server: { port: 3014 },
})
