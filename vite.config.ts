import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Served from https://tiong-ui.github.io/look-back/ on GitHub Pages.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/look-back/',
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1100, // maplibre-gl alone is ~800 kB
    rollupOptions: { output: { manualChunks: { maplibre: ['maplibre-gl'] } } },
  },
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
});
