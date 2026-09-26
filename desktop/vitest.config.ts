import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'src/shared/**/*.test.ts',
      'src/renderer/src/lib/**/*.test.ts',
      'src/renderer/src/components/**/*.test.tsx'
    ]
  },
  resolve: {
    alias: {
      '@shared': resolve('src/shared')
    }
  }
})
