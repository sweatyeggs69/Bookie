// ─── Theme preferences (persisted in localStorage) ──────────────────

export type ThemeMode = 'system' | 'light' | 'dark'

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

export function getSidebarCollapsed(): boolean {
  return read('sidebar-collapsed') === '1'
}

export function setSidebarCollapsed(collapsed: boolean) {
  write('sidebar-collapsed', collapsed ? '1' : '0')
}
