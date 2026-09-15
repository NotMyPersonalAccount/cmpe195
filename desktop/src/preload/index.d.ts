import type { CatchApi } from '../shared/api'

declare global {
  interface Window {
    api: CatchApi
  }
}

export {}
