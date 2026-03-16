import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Filters, User } from './types'

// ─── Persisted preferences (viewMode, gridSize) ───────────────────────────────

interface PersistedPrefs {
  viewMode: 'grid' | 'list'
  gridSize: number
}

// ─── Full store shape ─────────────────────────────────────────────────────────

interface StoreState extends PersistedPrefs {
  // Auth
  user: User | null
  setUser: (user: User | null) => void

  // Navigation
  view: 'library' | 'upload' | 'settings'
  setView: (view: 'library' | 'upload' | 'settings') => void

  // Filters (changing any filter resets to page 1)
  filters: Filters
  setFilters: (partial: Partial<Filters>) => void

  // Pagination
  page: number
  setPage: (page: number) => void

  // View preferences (persisted)
  setViewMode: (mode: 'grid' | 'list') => void
  setGridSize: (size: number) => void

  // Selected book (detail panel / drawer)
  selectedBookId: number | null
  setSelectedBookId: (id: number | null) => void

  // Search query (convenience wrapper — also synced into filters.q)
  searchQuery: string
  setSearchQuery: (query: string) => void
}

// ─── Default filter state ─────────────────────────────────────────────────────

const defaultFilters: Filters = {
  q: '',
  format: '',
  tag: '',
  sort: 'date_added',
  order: 'desc',
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useStore = create<StoreState>()(
  persist(
    (set) => ({
      // Auth
      user: null,
      setUser: (user) => set({ user }),

      // Navigation
      view: 'library',
      setView: (view) => set({ view }),

      // Filters
      filters: { ...defaultFilters },
      setFilters: (partial) =>
        set((state) => ({
          filters: { ...state.filters, ...partial },
          // Reset to first page whenever filters change
          page: 1,
        })),

      // Pagination
      page: 1,
      setPage: (page) => set({ page }),

      // View preferences (initial values — overridden by persisted storage)
      viewMode: 'grid',
      setViewMode: (viewMode) => set({ viewMode }),

      gridSize: 160,
      setGridSize: (gridSize) => set({ gridSize }),

      // Selected book
      selectedBookId: null,
      setSelectedBookId: (selectedBookId) => set({ selectedBookId }),

      // Search query — synced into filters.q and resets page
      searchQuery: '',
      setSearchQuery: (query) =>
        set((state) => ({
          searchQuery: query,
          filters: { ...state.filters, q: query },
          page: 1,
        })),
    }),
    {
      name: 'bookie-prefs',
      partialize: (state: StoreState): PersistedPrefs => ({
        viewMode: state.viewMode,
        gridSize: state.gridSize,
      }),
    },
  ),
)
