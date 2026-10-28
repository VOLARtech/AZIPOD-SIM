import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// Two outputs from one codebase:
//   default  → the installable PWA (multi-file, service worker, works offline after first visit)
//   --mode single → one self-contained HTML file to download and open with no internet at all
export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  return {
    base: process.env.BASE ?? './',
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __BUILD__: JSON.stringify((process.env.GITHUB_SHA ?? 'local').slice(0, 7)),
      __PWA__: JSON.stringify(!single),
      __REPO_URL__: JSON.stringify(process.env.REPO_URL ?? 'https://github.com/VOLARtech/AZIPOD-SIM'),
    },
    resolve: {
      alias: [
        // three.js addons (glTF loader) import 'three'; the app runs on 'three/webgpu', which contains it
        { find: /^three$/, replacement: 'three/webgpu' },
        ...(single ? [
          { find: 'virtual:pwa-register', replacement: fileURLToPath(new URL('./src/pwa-stub.ts', import.meta.url)) },
          // the offline single file stays small: ships keep their procedural 3D look
          { find: /^\.\/models\/urls$/, replacement: fileURLToPath(new URL('./src/view3d/models/urls.stub.ts', import.meta.url)) },
        ] : []),
      ],
    },
    build: {
      target: 'es2020',
      outDir: single ? 'dist-single' : 'dist',
      assetsInlineLimit: single ? 100_000_000 : 4096,
      chunkSizeWarningLimit: 1200,   // the lazily loaded 3D view (three.js) is ~0.9 MB, ~260 kB gzipped
    },
    plugins: single ? [viteSingleFile()] : [
      VitePWA({
        registerType: 'prompt',
        injectRegister: false,
        includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
        manifest: {
          id: './',
          name: 'Azipod Bridge — ship-handling simulator',
          short_name: 'Azipod Bridge',
          description: 'Learn to handle ships: 22 ships from tugs to giant container ships, real ports in 3D, wind, current, tugs and mooring. Works offline.',
          lang: 'en',
          start_url: './',
          scope: './',
          display: 'standalone',
          orientation: 'any',
          background_color: '#06121a',
          theme_color: '#06121a',
          categories: ['education', 'navigation', 'simulation'],
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,woff2,png,svg,webmanifest,bin}'],
          // ship models load when a ship is first shown, and are kept for offline use from then on
          runtimeCaching: [{ urlPattern: /\.glb$/, handler: 'CacheFirst', options: { cacheName: 'ship-models', expiration: { maxEntries: 40 } } }],
          globIgnores: ['**/azipod-bridge-offline.html'],
          navigateFallback: 'index.html',
          cleanupOutdatedCaches: true,
          maximumFileSizeToCacheInBytes: 5_000_000,
        },
      }),
    ],
  };
});
