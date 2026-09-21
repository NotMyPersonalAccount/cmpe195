import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const shared = resolve('src/shared')

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': shared
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': shared
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': shared
      }
    },
    plugins: [react()],
    optimizeDeps: {
      exclude: ['@huggingface/transformers']
    },
    build: {
      // The audio worklet must stay a real same-origin file. Inlined as a
      // data: URI it is blocked by the renderer's script-src, which would
      // break live transcription only in a packaged build.
      assetsInlineLimit: (filePath: string) =>
        filePath.includes('pcm-worklet') ? false : undefined
    }
  }
})
