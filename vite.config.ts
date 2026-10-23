import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

function singleHtml(): Plugin {
  let outDir: string;
  return {
    name: 'single-html',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const page = join(outDir, 'index.html');
      let html = readFileSync(page, 'utf8');
      const assets = join(outDir, 'assets');
      for (const fileName of readdirSync(assets)) {
        const path = join(assets, fileName);
        if (fileName.endsWith('.js')) {
          const tag = new RegExp(`<script[^>]+src="\\./assets/${fileName}"[^>]*></script>`);
          if (!tag.test(html)) throw new Error(`Missing script tag for ${fileName}`);
          html = html.replace(
            tag,
            `<script type="module">${readFileSync(path, 'utf8').replace(/<\/script/gi, '<\\/script')}</script>`,
          );
        } else if (fileName.endsWith('.css')) {
          const tag = new RegExp(`<link[^>]+href="\\./assets/${fileName}"[^>]*>`);
          if (!tag.test(html)) throw new Error(`Missing stylesheet tag for ${fileName}`);
          html = html.replace(
            tag,
            `<style>${readFileSync(path, 'utf8').replace(/<\/style/gi, '<\\/style')}</style>`,
          );
        } else {
          throw new Error(`Unexpected asset in single-file build: ${fileName}`);
        }
        rmSync(path);
      }
      writeFileSync(page, html);
      rmSync(assets, { recursive: true });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), singleHtml()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    cssCodeSplit: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
