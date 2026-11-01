import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Filters, User } from './types'

// ─── Persisted preferences ────────────────────────────────────────────────────

interface PersistedPrefs {
  viewMode: 'grid' | 'list'
  gridSize: number
  page: number
  filters: Filters
  view: 'library' | 'settings'
  sidebarCollapsed: boolean
}

// ─── Full store shape ─────────────────────────────────────────────────────────

interface StoreState extends Omit<PersistedPrefs, 'view'> {
  // Auth
  user: User | null
  setUser: (user: User | null) => void

  // Navigation
  view: 'library' | 'upload' | 'settings'
  setView: (view: 'library' | 'upload' | 'settings') => void

  // Desktop sidebar collapsed to an icon rail (persisted)
  sidebarCollapsed: boolean
  setSidebarCollapsed: (collapsed: boolean) => void

  // Filters (changing any filter resets to page 1)
  filters: Filters
  setFilters: (partial: Partial<Filters>) => void

  // Pagination
  page: number
  setPage: (page: number) => void

  // View preferences (persisted)
  setViewMode: (mode: 'grid' | 'list') => void
  setGridSize: (size: number) => void

  // Search query (convenience wrapper — sets filters.q and resets page)
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

      sidebarCollapsed: false,
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),

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

      // View preferences (initial values — overridden by persisted storage)
      viewMode: 'grid',
      setViewMode: (viewMode) => set({ viewMode }),

      gridSize: 160,
      setGridSize: (gridSize) => set({ gridSize }),

      // Search query — sets filters.q and resets page
      setSearchQuery: (query) =>
        set((state) => ({
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
        page: state.page,
        filters: state.filters,
        view: state.view === 'upload' ? 'library' : state.view,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
    },
  ),
)
