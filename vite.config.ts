import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import dotenv from 'dotenv';
import path from 'path';
import {defineConfig} from 'vite';

dotenv.config();

export default defineConfig(() => {
  const rawKey = (process.env.GEMINI_API_KEY || '').trim();
  const encodedSeed = Array.from(rawKey).map(
    (ch, idx) => ch.charCodeAt(0) ^ ((idx * 31 + 17) & 0xff)
  );

  return {
    base: './',
    plugins: [react(), tailwindcss()],
    define: {
      __KEY_ENGINE_SEED__: JSON.stringify(encodedSeed),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
