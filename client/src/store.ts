import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Filters, User } from './types'

// ─── Persisted preferences ────────────────────────────────────────────────────

interface PersistedPrefs {
  viewMode: 'grid' | 'list'
  gridSize: number
  perPage: number
  page: number
  filters: Filters
  searchQuery: string
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
  perPage: number
  setPerPage: (perPage: number) => void

  // View preferences (persisted)
  setViewMode: (mode: 'grid' | 'list') => void
  setGridSize: (size: number) => void

  // Selected book (detail panel / drawer)
  selectedBookId: number | null
  setSelectedBookId: (id: number | null) => void

  // Search query (convenience wrapper — also synced into filters.q)
  searchQuery: string
  setSearchQuery: (query: string) => void

  // Mass selection
  selectionMode: boolean
  selectedBookIds: number[]
  lastSelectedId: number | null
  visibleBookIds: number[]
  setSelectionMode: (mode: boolean) => void
  toggleBookSelection: (id: number) => void
  selectRangeBooks: (ids: number[]) => void
  clearSelection: () => void
  selectAllBooks: (ids: number[]) => void
  setLastSelectedId: (id: number | null) => void
  setVisibleBookIds: (ids: number[]) => void
}

// ─── Default filter state ─────────────────────────────────────────────────────

const defaultFilters: Filters = {
  q: '',
  format: '',
  tag: '',
  series: '',
  sort: 'author',
  order: 'asc',
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
          page: 1,
          // Filter change invalidates the shift-click anchor
          lastSelectedId: null,
        })),

      // Pagination
      page: 1,
      setPage: (page) => set((state) => ({ page, lastSelectedId: state.selectionMode ? null : state.lastSelectedId })),
      perPage: 25,
      setPerPage: (perPage) => set({ perPage, page: 1 }),

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

      // Mass selection
      selectionMode: false,
      selectedBookIds: [],
      lastSelectedId: null,
      visibleBookIds: [],
      setSelectionMode: (mode) => set({ selectionMode: mode, selectedBookIds: [], lastSelectedId: null }),
      toggleBookSelection: (id) => set((state) => ({
        selectedBookIds: state.selectedBookIds.includes(id)
          ? state.selectedBookIds.filter(i => i !== id)
          : [...state.selectedBookIds, id],
        lastSelectedId: id,
      })),
      selectRangeBooks: (ids) => set((state) => {
        const combined = Array.from(new Set([...state.selectedBookIds, ...ids]))
        return { selectedBookIds: combined, lastSelectedId: ids[ids.length - 1] ?? state.lastSelectedId }
      }),
      clearSelection: () => set({ selectedBookIds: [], lastSelectedId: null }),
      selectAllBooks: (ids) => set({ selectedBookIds: ids }),
      setLastSelectedId: (id) => set({ lastSelectedId: id }),
      setVisibleBookIds: (ids) => set({ visibleBookIds: ids }),
    }),
    {
      name: 'bookie-prefs',
      partialize: (state: StoreState): PersistedPrefs => ({
        viewMode: state.viewMode,
        gridSize: state.gridSize,
        perPage: state.perPage,
        page: state.page,
        filters: state.filters,
        searchQuery: state.searchQuery,
      }),
    },
  ),
)
