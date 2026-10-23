import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { readFileSync } from 'node:fs';

const icon = readFileSync(new URL('./src/assets/icon.svg', import.meta.url), 'utf8');

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    viteSingleFile(),
    {
      name: 'inline-sketch-icon',
      transformIndexHtml(html) {
        return html.replace('__SKETCH_ICON__', `data:image/svg+xml,${encodeURIComponent(icon)}`);
      },
    },
  ],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
