import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig(({ mode }) => {
  const isChrome = mode === 'chrome'

  return {
    build: {
      outDir: isChrome ? 'dist/chrome' : 'dist/firefox',
      rollupOptions: {
        input: {
          background: resolve(__dirname, 'src/background/index.ts'),
          sidebar: resolve(__dirname, 'src/sidebar/index.html'),
        },
        output: {
          entryFileNames: '[name].js',
          chunkFileNames: '[name].js',
          assetFileNames: '[name].[ext]',
        },
      },
      target: 'esnext',
      minify: false,
    },
    define: {
      __IS_CHROME__: JSON.stringify(isChrome),
    },
    test: {
      globals: true,
      environment: 'jsdom',
    },
  }
})
