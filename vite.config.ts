import { defineConfig } from 'vitest/config'
import type { Plugin } from 'vite'
import { resolve } from 'path'
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'fs'

const { version: appVersion } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

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
          permissions: [...new Set([...(base.permissions ?? []), ...(overrides.permissions ?? [])])],
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
      mkdirSync(`${outDir}/icons`, { recursive: true })
      for (const size of [16, 32, 48, 128]) {
        copyFileSync(`src/icons/icon${size}.png`, `${outDir}/icons/icon${size}.png`)
      }
      mkdirSync(`${outDir}/licenses`, { recursive: true })
      copyFileSync('licenses/CodexBar-MIT.txt', `${outDir}/licenses/CodexBar-MIT.txt`)
      copyFileSync('node_modules/webextension-polyfill/LICENSE', `${outDir}/licenses/webextension-polyfill-MPL-2.0.txt`)
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
          background: resolve(import.meta.dirname, 'src/background/index.ts'),
          sidebar: resolve(import.meta.dirname, 'src/sidebar/index.html'),
        },
        output: {
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
      __APP_VERSION__: JSON.stringify(appVersion),
    },
    plugins: [manifestPlugin(isChrome)],
    test: {
      globals: true,
      environment: 'jsdom',
    },
  }
})
