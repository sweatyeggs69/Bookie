import { useSyncExternalStore } from 'react'

// The grid size slider sets a target card width in pixels. Phones get their
// own, smaller range and their own saved value, so a size picked on a laptop
// doesn't leave a phone with one giant card per row.
export interface GridSizeRange { min: number; max: number }

export const DESKTOP_RANGE: GridSizeRange = { min: 100, max: 240 }
export const PHONE_RANGE: GridSizeRange = { min: 72, max: 150 }

export const DEFAULT_DESKTOP_SIZE = 160
export const DEFAULT_PHONE_SIZE = 96 // three columns on a typical phone

const PHONE_QUERY = '(max-width: 639px)'

export function clampSize(size: number, range: GridSizeRange): number {
  return Math.min(range.max, Math.max(range.min, Math.round(size)))
}

function subscribe(cb: () => void) {
  const mq = window.matchMedia(PHONE_QUERY)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}

export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(PHONE_QUERY).matches)
}
