import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Grid2x2, List, SlidersHorizontal, ChevronDown, X, Trash2 } from 'lucide-react'
import { useStore } from '../store'
import * as api from '../api/client'
import { Tag } from '../types'
import SearchBar from './SearchBar'

const FORMAT_OPTIONS = [
  { value: '', label: 'All Formats' },
  { value: 'epub', label: 'EPUB' },
  { value: 'pdf', label: 'PDF' },
  { value: 'mobi', label: 'MOBI' },
  { value: 'azw3', label: 'AZW3' },
  { value: 'fb2', label: 'FB2' },
  { value: 'djvu', label: 'DJVU' },
  { value: 'cbz', label: 'CBZ' },
  { value: 'cbr', label: 'CBR' },
  { value: 'txt', label: 'TXT' },
]

const SORT_OPTIONS = [
  { value: 'author', label: 'Author' },
  { value: 'title', label: 'Title' },
  { value: 'series', label: 'Series' },
  { value: 'published_date', label: 'Published Year' },
  { value: 'date_added', label: 'Date Added' },
  { value: 'file_size', label: 'File Size' },
]

const PER_PAGE_OPTIONS = [10, 25, 50, 100]

const GRID_SIZES = [
  { value: 120, label: 'Small' },
  { value: 160, label: 'Medium' },
  { value: 210, label: 'Large' },
]

const selectCls = [
  'appearance-none px-3 py-1.5 pr-7 rounded border border-line',
  'bg-surface-raised text-ink text-sm',
  'hover:border-line-strong transition-colors',
  'focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent',
  'cursor-pointer',
].join(' ')

export default function FilterBar() {
  const {
    filters, setFilters, viewMode, setViewMode, gridSize, setGridSize,
    perPage, setPerPage,
    selectionMode, selectedBookIds, visibleBookIds, setSelectionMode, clearSelection, selectAllBooks,
  } = useStore()
  // 'filters' | 'views' | null — only one panel open at a time on mobile
  const [mobilePanel, setMobilePanel] = useState<'filters' | 'views' | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [tagging, setTagging] = useState(false)
  const [clearingTags, setClearingTags] = useState(false)
  const [selectionHasTaggedBooks, setSelectionHasTaggedBooks] = useState(false)
  const [fetchingMeta, setFetchingMeta] = useState(false)
  const [fetchMetaProgress, setFetchMetaProgress] = useState<{ done: number; total: number } | null>(null)
  const qc = useQueryClient()

  const toggleMobilePanel = (panel: 'filters' | 'views') =>
    setMobilePanel(prev => (prev === panel ? null : panel))

  // Hide filter bar when scrolling down on mobile, reveal on scroll up
  const [barHidden, setBarHidden] = useState(false)
  const lastScrollY = useRef(0)
  const mobilePanelRef = useRef(mobilePanel)
  useEffect(() => { mobilePanelRef.current = mobilePanel }, [mobilePanel])

  useEffect(() => {
    const onScroll = () => {
      if (window.innerWidth >= 1024) { setBarHidden(false); return }
      if (mobilePanelRef.current !== null) { setBarHidden(false); lastScrollY.current = window.scrollY; return }
      const current = window.scrollY
      if (current < 80) { setBarHidden(false); lastScrollY.current = current; return }
      const delta = current - lastScrollY.current
      if (Math.abs(delta) > 6) setBarHidden(delta > 0)
      lastScrollY.current = current
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const { data: tags = [] } = useQuery<Tag[]>({
    queryKey: ['tags'],
    queryFn: () => api.getTags(),
  })

  const { data: seriesList = [] } = useQuery<string[]>({
    queryKey: ['series'],
    queryFn: () => api.getSeries(),
  })

  const refreshSelectionHasTaggedBooks = useCallback(async () => {
    if (!selectionMode || selectedBookIds.length === 0) {
      setSelectionHasTaggedBooks(false)
      return
    }
    try {
      for (const bookId of selectedBookIds) {
        const tagsForBook = await api.getBookTags(bookId)
        if (tagsForBook.length > 0) {
          setSelectionHasTaggedBooks(true)
          return
        }
      }
      setSelectionHasTaggedBooks(false)
    } catch {
      setSelectionHasTaggedBooks(false)
    }
  }, [selectionMode, selectedBookIds])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      await refreshSelectionHasTaggedBooks()
      if (cancelled) return
    }
    run()
    return () => { cancelled = true }
  }, [refreshSelectionHasTaggedBooks])

  const hasActiveFilters =
    filters.format !== '' || filters.tag !== '' || filters.series !== '' ||
    filters.sort !== 'author' || filters.order !== 'asc'

  const clearFilters = () => setFilters({ format: '', tag: '', series: '', sort: 'author', order: 'asc' })
  const toggleOrder = () => setFilters({ order: filters.order === 'asc' ? 'desc' : 'asc' })

  // Wrapper for fixed-width selects
  function Sel({ children, width = 'w-32' }: { children: React.ReactNode; width?: string }) {
    return (
      <div className={`relative shrink-0 ${width}`}>
        {children}
        <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
      </div>
    )
  }

  const handleBulkDelete = async () => {
    if (selectedBookIds.length === 0) return
    if (!window.confirm(`Delete ${selectedBookIds.length} book${selectedBookIds.length !== 1 ? 's' : ''}? This cannot be undone.`)) return
    setDeleting(true)
    try {
      await api.bulkDeleteBooks(selectedBookIds)
      setSelectionMode(false)
      qc.invalidateQueries({ queryKey: ['books'] })
    } finally {
      setDeleting(false)
    }
  }

  const handleBulkTag = async (tagName: string) => {
    if (!tagName || selectedBookIds.length === 0) return
    setTagging(true)
    try {
      await api.bulkAddTag(selectedBookIds, tagName)
      setSelectionHasTaggedBooks(true)
      qc.invalidateQueries({ queryKey: ['books'] })
      qc.invalidateQueries({ queryKey: ['tags'] })
    } finally {
      setTagging(false)
    }
  }

  const handleBulkClearTags = async () => {
    if (selectedBookIds.length === 0) return
    setClearingTags(true)
    let failedBooks = 0
    try {
      for (const bookId of selectedBookIds) {
        try {
          const bookTags = await api.getBookTags(bookId)
          for (const tag of bookTags) {
            await api.removeBookTag(bookId, tag.id)
          }
        } catch {
          failedBooks += 1
        }
      }
      qc.invalidateQueries({ queryKey: ['books'] })
      qc.invalidateQueries({ queryKey: ['tags'] })
      await refreshSelectionHasTaggedBooks()
      if (failedBooks > 0) {
        window.alert(`Cleared tags for most books, but ${failedBooks} book${failedBooks === 1 ? '' : 's'} failed. Please try again.`)
      }
    } finally {
      setClearingTags(false)
    }
  }

  const handleBulkFetchMetadata = async () => {
    if (selectedBookIds.length === 0 || fetchingMeta) return
    setFetchingMeta(true)
    setFetchMetaProgress({ done: 0, total: selectedBookIds.length })
    // Process one at a time so we can show progress and avoid hammering APIs
    for (let i = 0; i < selectedBookIds.length; i++) {
      try {
        await api.bulkFetchMetadata([selectedBookIds[i]])
      } catch { /* continue on individual failure */ }
      setFetchMetaProgress({ done: i + 1, total: selectedBookIds.length })
    }
    setFetchingMeta(false)
    setFetchMetaProgress(null)
    qc.invalidateQueries({ queryKey: ['books'] })
  }

  const handleSelectAllLibrary = async () => {
    try {
      const { ids } = await api.getBookIds({
        q: filters.q || undefined,
        format: filters.format || undefined,
        tag: filters.tag || undefined,
        series: filters.series || undefined,
      })
      selectAllBooks(ids)
    } catch { /* ignore */ }
  }

  const btnCls = "px-2.5 py-1.5 rounded border border-line bg-surface-raised text-ink-muted text-sm hover:text-ink hover:border-line-strong transition-colors"

  const selectionToolbar = (
    <div className="flex items-center justify-between gap-2 w-full">
      {/* Left: selection helpers */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <button type="button" onClick={() => selectAllBooks(visibleBookIds)} className={btnCls}>Select Page</button>
        <button type="button" onClick={handleSelectAllLibrary} className={btnCls}>Select All</button>
        <button type="button" onClick={clearSelection} className={btnCls}>Clear</button>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-1.5 flex-wrap justify-end">
        <button
          type="button"
          onClick={handleBulkFetchMetadata}
          disabled={selectedBookIds.length === 0 || fetchingMeta}
          className={`${btnCls} disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          {fetchingMeta && fetchMetaProgress
            ? `${fetchMetaProgress.done}/${fetchMetaProgress.total}`
            : 'Fetch Metadata'}
        </button>

        {tags.length > 0 && (
          <div className="relative w-32">
            <select
              defaultValue=""
              onChange={e => { if (e.target.value) handleBulkTag(e.target.value); e.target.value = '' }}
              disabled={selectedBookIds.length === 0 || tagging}
              className={`${selectCls} w-full`}
              aria-label="Assign tag to selected books"
            >
              <option value="">Tags</option>
              {tags.map(t => (
                <option key={t.id} value={t.name}>{t.name}</option>
              ))}
            </select>
            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
          </div>
        )}

        {selectionHasTaggedBooks && (
          <button
            type="button"
            onClick={handleBulkClearTags}
            disabled={selectedBookIds.length === 0 || clearingTags}
            className={`${btnCls} disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            Clear Tags
          </button>
        )}

        <button
          type="button"
          onClick={handleBulkDelete}
          disabled={selectedBookIds.length === 0 || deleting}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded border border-red-500/40 bg-red-500/10 text-red-400 text-sm hover:bg-red-500/20 hover:border-red-500/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Trash2 size={13} />
          Delete{selectedBookIds.length > 0 ? ` (${selectedBookIds.length})` : ''}
        </button>

        <button
          type="button"
          onClick={() => setSelectionMode(false)}
          className={`flex items-center gap-1 ${btnCls}`}
          aria-label="Exit selection mode"
        >
          <X size={13} />
          Exit
        </button>
      </div>
    </div>
  )

  const filterControls = (
    <div className="flex flex-wrap items-center gap-2">
      <Sel>
        <select
          value={filters.format}
          onChange={e => setFilters({ format: e.target.value })}
          className={`${selectCls} w-full`}
          aria-label="Filter by format"
        >
          {FORMAT_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </Sel>

      {seriesList.length > 0 && (
        <Sel width="w-32">
          <select
            value={filters.series}
            onChange={e => setFilters({ series: e.target.value })}
            className={`${selectCls} w-full`}
            aria-label="Filter by series"
          >
            <option value="">All Series</option>
            {seriesList.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Sel>
      )}

      {tags.length > 0 && (
        <Sel width="w-32">
          <select
            value={filters.tag}
            onChange={e => setFilters({ tag: e.target.value })}
            className={`${selectCls} w-full`}
            aria-label="Filter by tag"
          >
            <option value="">All Tags</option>
            {tags.map(t => (
              <option key={t.id} value={t.name}>{t.name} ({t.book_count})</option>
            ))}
          </select>
        </Sel>
      )}

      <Sel width="w-32">
        <select
          value={filters.sort}
          onChange={e => setFilters({ sort: e.target.value as typeof filters.sort })}
          className={`${selectCls} w-full`}
          aria-label="Sort by"
        >
          {SORT_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </Sel>

      <button
        type="button"
        onClick={toggleOrder}
        className="shrink-0 px-3 py-1.5 rounded border border-line bg-surface-raised text-ink text-sm hover:border-line-strong transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        aria-label={`Sort ${filters.order === 'asc' ? 'ascending' : 'descending'} — click to toggle`}
      >
        {filters.order === 'asc' ? '↑ Asc' : '↓ Desc'}
      </button>

      {hasActiveFilters && (
        <button
          type="button"
          onClick={clearFilters}
          className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded text-sm text-ink-muted border border-line hover:text-ink hover:bg-surface-raised transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label="Clear all filters"
        >
          <X size={13} />
          Clear
        </button>
      )}
    </div>
  )

  // Shared view controls — used in desktop row and mobile panel
  const viewControls = (
    <div className="flex flex-wrap items-center gap-2">
      {/* Per-page dropdown */}
      <div className="relative w-32">
        <select
          value={perPage}
          onChange={e => setPerPage(Number(e.target.value))}
          className={`${selectCls} w-full`}
          aria-label="Books per page"
        >
          {PER_PAGE_OPTIONS.map(n => (
            <option key={n} value={n}>{n} / page</option>
          ))}
        </select>
        <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
      </div>

      {/* Grid size — only in grid mode */}
      {viewMode === 'grid' && (
        <div className="relative w-32">
          <select
            value={gridSize}
            onChange={e => setGridSize(Number(e.target.value))}
            className={`${selectCls} w-full`}
            aria-label="Grid size"
          >
            {GRID_SIZES.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
        </div>
      )}

      {/* View mode toggle */}
      <div className="flex items-stretch h-8 rounded border border-line overflow-hidden">
        <button
          type="button"
          onClick={() => setViewMode('grid')}
          aria-label="Grid view"
          aria-pressed={viewMode === 'grid'}
          className={[
            'px-2.5 transition-colors focus-visible:outline-none',
            viewMode === 'grid'
              ? 'bg-surface-high text-ink'
              : 'bg-surface-raised text-ink-muted hover:text-ink',
          ].join(' ')}
        >
          <Grid2x2 size={15} />
        </button>
        <button
          type="button"
          onClick={() => setViewMode('list')}
          aria-label="List view"
          aria-pressed={viewMode === 'list'}
          className={[
            'px-2.5 transition-colors border-l border-line focus-visible:outline-none',
            viewMode === 'list'
              ? 'bg-surface-high text-ink'
              : 'bg-surface-raised text-ink-muted hover:text-ink',
          ].join(' ')}
        >
          <List size={15} />
        </button>
      </div>
    </div>
  )

  return (
    <div className={[
      'sticky top-14 z-30 bg-surface border-b border-line px-4 py-2.5 flex flex-col gap-2',
      'transition-transform duration-300 ease-in-out',
      barHidden ? '-translate-y-full lg:translate-y-0' : 'translate-y-0',
    ].join(' ')}>

      {/* Mobile/tablet: search + panel triggers (hidden in selection mode) */}
      <div className={`lg:hidden flex items-center gap-2${selectionMode ? ' hidden' : ''}`}>
        <div className="flex-1">
          <SearchBar />
        </div>

        {!selectionMode && (
          <>
            {/* Filters trigger */}
            <button
              type="button"
              onClick={() => toggleMobilePanel('filters')}
              className={[
                'relative flex items-center justify-center w-10 h-10 shrink-0 rounded border bg-surface-raised transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                mobilePanel === 'filters'
                  ? 'border-accent text-accent bg-accent/10'
                  : hasActiveFilters
                    ? 'border-accent text-accent'
                    : 'border-line text-ink-muted hover:border-line-strong hover:text-ink',
              ].join(' ')}
              aria-expanded={mobilePanel === 'filters'}
              aria-label="Filters"
            >
              <SlidersHorizontal size={14} />
              {hasActiveFilters && mobilePanel !== 'filters' && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-accent border-2 border-surface" />
              )}
            </button>

            {/* Views trigger */}
            <button
              type="button"
              onClick={() => toggleMobilePanel('views')}
              className={[
                'flex items-center justify-center w-10 h-10 shrink-0 rounded border bg-surface-raised transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                mobilePanel === 'views'
                  ? 'border-accent text-accent bg-accent/10'
                  : 'border-line text-ink-muted hover:border-line-strong hover:text-ink',
              ].join(' ')}
              aria-expanded={mobilePanel === 'views'}
              aria-label="View options"
            >
              {viewMode === 'grid' ? <Grid2x2 size={14} /> : <List size={14} />}
            </button>
          </>
        )}
      </div>

      {/* Desktop + mobile selection toolbar row */}
      <div className={`flex items-center justify-between gap-3${selectionMode ? '' : ' hidden lg:flex'}`}>
        {selectionMode ? (
          <div className="flex-1 min-w-0">
            {selectionToolbar}
          </div>
        ) : (
          <>
            {/* Desktop: inline filters */}
            <div className="hidden lg:flex flex-1 min-w-0">
              {filterControls}
            </div>

            {/* Desktop: right controls */}
            <div className="hidden lg:flex items-center gap-2 shrink-0">
              {viewControls}
            </div>
          </>
        )}
      </div>

      {/* Mobile: collapsible panels — only one shown at a time */}
      {!selectionMode && mobilePanel === 'filters' && (
        <div className="lg:hidden pb-1">
          {filterControls}
        </div>
      )}
      {!selectionMode && mobilePanel === 'views' && (
        <div className="lg:hidden pb-1">
          {viewControls}
        </div>
      )}
    </div>
  )
}
