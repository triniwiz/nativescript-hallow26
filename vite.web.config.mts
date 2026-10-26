import tailwindcss from '@tailwindcss/postcss';
import vue from '@vitejs/plugin-vue';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));
const src = path.resolve(root, 'src');

export default defineConfig({
  // Relative so the build works from a GitHub Pages sub-path.
  base: './',
  plugins: [
    vue({
      script: {
        defineModel: true,
        propsDestructure: true,
      },
      template: {
        transformAssetUrls: false,
      },
    }),
  ],
  resolve: {
    extensions: ['.web.ts', '.web.vue', '.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'],
    alias: [
      { find: /^\.\.\/art\/workers$/, replacement: path.resolve(src, 'art/workers.web.ts') },
      { find: /^\.\/workers$/, replacement: path.resolve(src, 'rites/seance/workers.web.ts') },
      { find: 'vue', replacement: path.resolve(src, 'web/vue.ts') },
      { find: 'nativescript-vue', replacement: path.resolve(src, 'web/nativescript-vue.ts') },
      { find: '@nativescript/core', replacement: path.resolve(src, 'web/nativescript-core.ts') },
      { find: '@nativescript/audio-context', replacement: path.resolve(src, 'web/audio-context.ts') },
      { find: '@nativescript/canvas/worker', replacement: path.resolve(src, 'web/canvas-worker.ts') },
      { find: '@nativescript/canvas-polyfill', replacement: path.resolve(src, 'web/canvas-polyfill.ts') },
      { find: '@nativescript/canvas-pixi', replacement: path.resolve(src, 'web/empty.ts') },
      { find: '@nativescript/canvas-three', replacement: 'three' },
      { find: '@nativescript/canvas', replacement: path.resolve(src, 'web/canvas.ts') },
    ],
  },
  define: {
    __IOS__: false,
    __ANDROID__: false,
    __WINDOWS__: false,
    __WEB__: true,
  },
  css: {
    postcss: {
      plugins: [tailwindcss({ optimize: false })],
    },
  },
  build: {
    outDir: 'dist/web',
    emptyOutDir: true,
  },
});
