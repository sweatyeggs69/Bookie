import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Grid2x2, List, SlidersHorizontal, ChevronDown, X } from 'lucide-react'
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
  { value: 'published_date', label: 'Release Date' },
  { value: 'date_added', label: 'Date Added' },
  { value: 'file_size', label: 'File Size' },
]

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
  const { filters, setFilters, viewMode, setViewMode, gridSize, setGridSize } = useStore()
  const [mobileOpen, setMobileOpen] = useState(false)

  const { data: tags = [] } = useQuery<Tag[]>({
    queryKey: ['tags'],
    queryFn: () => api.getTags(),
  })

  const { data: seriesList = [] } = useQuery<string[]>({
    queryKey: ['series'],
    queryFn: () => api.getSeries(),
  })

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

  const filterControls = (
    <div className="flex flex-wrap items-center gap-2">
      {/* Format */}
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

      {/* Tag — only shown when tags exist */}
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

      {/* Series — only shown when series exist */}
      {seriesList.length > 0 && (
        <Sel width="w-36">
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

      {/* Sort */}
      <Sel width="w-36">
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

      {/* Order toggle */}
      <button
        type="button"
        onClick={toggleOrder}
        className="shrink-0 px-3 py-1.5 rounded border border-line bg-surface-raised text-ink text-sm hover:border-line-strong transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        aria-label={`Sort ${filters.order === 'asc' ? 'ascending' : 'descending'} — click to toggle`}
      >
        {filters.order === 'asc' ? '↑ Asc' : '↓ Desc'}
      </button>

      {/* Clear */}
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

  return (
    <div className="sticky top-14 z-30 bg-surface border-b border-line px-4 py-2.5 flex flex-col gap-2">
      {/* Search — mobile only (desktop search is in TopBar) */}
      <div className="sm:hidden">
        <SearchBar />
      </div>

      <div className="flex items-center justify-between gap-3">
        {/* Mobile toggle */}
        <button
          type="button"
          onClick={() => setMobileOpen(v => !v)}
          className="sm:hidden flex items-center gap-1.5 px-3 py-1.5 rounded border border-line bg-surface-raised text-ink-muted text-sm hover:text-ink hover:border-line-strong transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-expanded={mobileOpen}
        >
          <SlidersHorizontal size={14} />
          Filters
          {hasActiveFilters && <span className="w-1.5 h-1.5 rounded-full bg-accent" />}
        </button>

        {/* Desktop: inline filters */}
        <div className="hidden sm:flex flex-1 min-w-0">
          {filterControls}
        </div>

        {/* Right: view mode + grid size */}
        <div className="flex items-center gap-2 shrink-0 ml-auto sm:ml-0">
          {viewMode === 'grid' && (
            <div className="relative">
              <select
                value={gridSize}
                onChange={e => setGridSize(Number(e.target.value))}
                className={selectCls}
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
          <div className="flex items-stretch rounded border border-line overflow-hidden">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              aria-label="Grid view"
              aria-pressed={viewMode === 'grid'}
              className={[
                'px-2.5 py-1.5 transition-colors focus-visible:outline-none',
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
                'px-2.5 py-1.5 transition-colors border-l border-line focus-visible:outline-none',
                viewMode === 'list'
                  ? 'bg-surface-high text-ink'
                  : 'bg-surface-raised text-ink-muted hover:text-ink',
              ].join(' ')}
            >
              <List size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile: collapsible filters */}
      {mobileOpen && (
        <div className="sm:hidden pb-1">
          {filterControls}
        </div>
      )}
    </div>
  )
}
