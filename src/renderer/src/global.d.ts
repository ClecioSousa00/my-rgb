import type { MyRgbApi } from '@shared/api'

declare global {
  interface Window {
    myrgb: MyRgbApi
  }
}

export {}
