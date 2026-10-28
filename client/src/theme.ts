// ─── Theme + accent preferences (persisted in localStorage) ──────────────────

export type ThemeMode = 'system' | 'light' | 'dark'

export type AccentColor = 'blue' | 'violet' | 'teal' | 'green' | 'yellow' | 'orange' | 'rose'

// [base, hover] as "r g b" channels, matching Tailwind's 500 / 400 shades
export const ACCENTS: Record<AccentColor, { label: string; base: string; hover: string; swatch: string }> = {
  blue:   { label: 'Blue',   base: '59 130 246',  hover: '96 165 250',  swatch: '#3b82f6' },
  violet: { label: 'Violet', base: '124 106 248', hover: '145 128 250', swatch: '#7c6af8' },
  teal:   { label: 'Teal',   base: '20 184 166',  hover: '45 212 191',  swatch: '#14b8a6' },
  green:  { label: 'Green',  base: '34 197 94',   hover: '74 222 128',  swatch: '#22c55e' },
  yellow: { label: 'Yellow', base: '234 179 8',   hover: '250 204 21',  swatch: '#eab308' },
  orange: { label: 'Orange', base: '249 115 22',  hover: '251 146 60',  swatch: '#f97316' },
  rose:   { label: 'Rose',   base: '244 63 94',   hover: '251 113 133', swatch: '#f43f5e' },
}

function read(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}

function write(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* storage unavailable */ }
}

export function getThemeMode(): ThemeMode {
  const v = read('theme')
  return v === 'light' || v === 'dark' ? v : 'system'
}

export function applyTheme(mode: ThemeMode) {
  if (mode === 'light') {
    document.documentElement.dataset.theme = 'light'
  } else if (mode === 'dark') {
    document.documentElement.dataset.theme = ''
  } else {
    const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches
    document.documentElement.dataset.theme = prefersLight ? 'light' : ''
  }
}

export function setThemeMode(mode: ThemeMode) {
  write('theme', mode)
  applyTheme(mode)
}

export function getAccent(): AccentColor {
  const v = read('accent') as AccentColor | null
  return v && v in ACCENTS ? v : 'blue'
}

export function applyAccent(accent: AccentColor) {
  const { base, hover } = ACCENTS[accent]
  const root = document.documentElement.style
  root.setProperty('--accent', base)
  root.setProperty('--accent-hover', hover)
}

export function setAccent(accent: AccentColor) {
  write('accent', accent)
  applyAccent(accent)
}

export function getSidebarCollapsed(): boolean {
  return read('sidebar-collapsed') === '1'
}

export function setSidebarCollapsed(collapsed: boolean) {
  write('sidebar-collapsed', collapsed ? '1' : '0')
}
