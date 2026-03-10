import { defineConfig, type Plugin } from 'vite'
import { resolve } from 'path'
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'fs'

function manifestPlugin(isChrome: boolean): Plugin {
  return {
    name: 'manifest-plugin',
    closeBundle() {
      const outDir = isChrome ? 'dist/chrome' : 'dist/firefox'
      const base = JSON.parse(readFileSync('manifest.json', 'utf8'))

      if (isChrome) {
        const overrides = JSON.parse(readFileSync('manifest.chrome.json', 'utf8'))
        const merged = {
          ...base,
          ...overrides,
          permissions: [...(base.permissions ?? []), ...(overrides.permissions ?? [])],
        }
        // Chrome doesn't use sidebar_action
        delete merged.sidebar_action
        writeFileSync(`${outDir}/manifest.json`, JSON.stringify(merged, null, 2))
      } else {
        // Firefox MV3 uses background.scripts instead of background.service_worker
        const ff = {
          ...base,
          background: {
            scripts: [base.background.service_worker],
            type: 'module',
          },
        }
        writeFileSync(`${outDir}/manifest.json`, JSON.stringify(ff, null, 2))
      }

      // Copy icons
      try {
        mkdirSync(`${outDir}/icons`, { recursive: true })
        for (const size of [16, 48, 128]) {
          copyFileSync(`src/icons/icon${size}.png`, `${outDir}/icons/icon${size}.png`)
        }
      } catch { /* icons not yet present, skip */ }
    }
  }
}

export default defineConfig(({ mode }) => {
  const isChrome = mode === 'chrome'

  return {
    build: {
      outDir: isChrome ? 'dist/chrome' : 'dist/firefox',
      emptyOutDir: true,
      rollupOptions: {
        input: {
          background: resolve(__dirname, 'src/background/index.ts'),
          sidebar: resolve(__dirname, 'src/sidebar/index.html'),
        },
        output: {
          // Service workers don't have `window`; shim it with `self` for background only
          banner: (chunk) => chunk.name === 'background' ? 'const window = self;' : '',
          entryFileNames: '[name].js',
          chunkFileNames: '[name].js',
          assetFileNames: '[name].[ext]',
        },
      },
      target: 'esnext',
      minify: false,
      modulePreload: { polyfill: false },
    },
    define: {
      __IS_CHROME__: JSON.stringify(isChrome),
    },
    plugins: [manifestPlugin(isChrome)],
    test: {
      globals: true,
      environment: 'jsdom',
    },
  }
})
