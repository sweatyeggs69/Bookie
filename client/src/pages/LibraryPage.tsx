import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, BookOpen, ChevronLeft, ChevronRight } from 'lucide-react'
import { useStore } from '../store'
import * as api from '../api/client'
import FilterBar from '../components/FilterBar'
import BookCard from '../components/BookCard'
import BookListItem from '../components/BookListItem'
import BookPage from './BookPage'

function getPageNumbers(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const result: (number | '…')[] = [1]
  if (current > 3) result.push('…')
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) {
    result.push(p)
  }
  if (current < total - 2) result.push('…')
  result.push(total)
  return result
}

// The open book lives in the URL hash (#book/123) so the browser back
// button and a page refresh both behave like the other views.
function getHashBookId(): number | null {
  const m = window.location.hash.match(/^#book\/(\d+)$/)
  return m ? Number(m[1]) : null
}

function useBookRoute() {
  const [bookId, setBookId] = useState<number | null>(getHashBookId)
  // True when the book was opened from the grid, so closing can step back in history
  const pushedRef = useRef(false)
  const scrollRef = useRef(0)

  useEffect(() => {
    const onHashChange = () => setBookId(getHashBookId())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  // Top of the page when a book opens; back to where the grid was when it closes
  useEffect(() => {
    if (bookId !== null) {
      window.scrollTo(0, 0)
    } else {
      pushedRef.current = false
      const y = scrollRef.current
      requestAnimationFrame(() => window.scrollTo(0, y))
    }
  }, [bookId])

  const open = (id: number) => {
    scrollRef.current = window.scrollY
    pushedRef.current = true
    window.location.hash = `book/${id}`
  }

  const close = () => {
    if (pushedRef.current) {
      history.back()
    } else {
      history.replaceState(null, '', window.location.pathname + window.location.search)
      setBookId(null)
    }
  }

  return { bookId, open, close }
}

const GRID_GAP = 12
const AREA_PADDING = 16 // px-4 py-4 on the content area
const LIST_GAP = 4 // space-y-1
const CARD_INFO_H = 70 // title + author block under the cover, until measured

// The library shows exactly one screen of books, with no scrolling. On wider
// screens each grid size has a target card width; as many whole rows and
// columns as fit at about that size are used. On phones the size sets the
// column count and rows fill the height.
interface GridLayout { rows: number; cols: number; cardW: number }

// Target card width for each size on wider screens
const DESKTOP_CARD_W: Record<number, number> = { 120: 125, 160: 165, 210: 230 }

// On phone-width screens the size picks the column count instead
const PHONE_MAX_W = 600
const PHONE_COLS: Record<number, number> = { 120: 4, 160: 3, 210: 2 }

function phoneLayout(w: number, h: number, size: number, infoH: number): GridLayout {
  const cols = PHONE_COLS[size] ?? 3
  const colW = (w - GRID_GAP * (cols - 1)) / cols
  const fitW = (rows: number) => ((h - GRID_GAP * (rows - 1)) / rows - infoH) / 1.5
  const slot = colW * 1.5 + infoH + GRID_GAP
  // Add the extra row that would fill the height only if the cards shrink
  // by no more than 15% to make room for it
  let rows = Math.max(1, Math.floor((h + GRID_GAP) / slot))
  if (fitW(rows + 1) >= colW * 0.85) rows += 1
  const cardW = Math.min(colW, fitW(rows))
  return { rows, cols, cardW: Math.max(40, Math.floor(cardW)) }
}

function gridLayout(w: number, h: number, size: number, infoH: number): GridLayout {
  if (w < PHONE_MAX_W) return phoneLayout(w, h, size, infoH)
  const target = DESKTOP_CARD_W[size] ?? 165
  const fitW = (rows: number) => ((h - GRID_GAP * (rows - 1)) / rows - infoH) / 1.5
  let rows = Math.max(1, Math.floor((h + GRID_GAP) / (target * 1.5 + infoH + GRID_GAP)))
  // Squeeze in one more row if the cards only shrink a little for it
  if (fitW(rows + 1) >= target * 0.85) rows += 1
  // Cards stay near their target width, growing at most 10% to fill the height
  const cardW = Math.min(fitW(rows), target * 1.1, w)
  const cols = Math.max(1, Math.floor((w + GRID_GAP) / (cardW + GRID_GAP)))
  return { rows, cols, cardW: Math.max(40, Math.floor(cardW)) }
}

function useFitLayout(viewMode: 'grid' | 'list', gridSize: number) {
  const [area, setArea] = useState<HTMLDivElement | null>(null)
  const [areaSize, setAreaSize] = useState({ w: 0, h: 0 })
  const [items, setItems] = useState<HTMLDivElement | null>(null)
  const [itemH, setItemH] = useState(0)
  const [infoH, setInfoH] = useState(CARD_INFO_H)

  useEffect(() => {
    if (!area) return
    const update = () => setAreaSize({
      w: area.clientWidth - AREA_PADDING * 2,
      h: area.clientHeight - AREA_PADDING * 2,
    })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(area)
    return () => ro.disconnect()
  }, [area])

  // Measure a real rendered item: a list row's height, or the part of a
  // card below its cover
  useEffect(() => {
    if (!items) return
    let ro: ResizeObserver | null = null
    const watch = () => {
      ro?.disconnect()
      const first = items.firstElementChild as HTMLElement | null
      if (!first) return
      const update = () => {
        setItemH(first.offsetHeight)
        const cover = first.firstElementChild as HTMLElement | null
        if (cover && viewMode === 'grid') setInfoH(Math.max(0, first.offsetHeight - cover.offsetHeight))
      }
      update()
      ro = new ResizeObserver(update)
      ro.observe(first)
    }
    watch()
    const mo = new MutationObserver(watch)
    mo.observe(items, { childList: true })
    return () => { mo.disconnect(); ro?.disconnect() }
  }, [items, viewMode])

  if (areaSize.h <= 0 || areaSize.w <= 0) {
    return { areaRef: setArea, itemsRef: setItems, count: 0, grid: null }
  }

  if (viewMode === 'list') {
    const h = itemH || 64
    const rows = Math.max(1, Math.floor((areaSize.h + LIST_GAP) / (h + LIST_GAP)))
    return { areaRef: setArea, itemsRef: setItems, count: Math.min(rows, 200), grid: null }
  }

  const grid = gridLayout(areaSize.w, areaSize.h, gridSize, infoH)
  return { areaRef: setArea, itemsRef: setItems, count: Math.min(grid.rows * grid.cols, 200), grid }
}

export default function LibraryPage() {
  const { filters, page, setPage, viewMode, gridSize, setVisibleBookIds } = useStore()
  const { bookId: selectedBookId, open: setSelectedBookId, close: closeBook } = useBookRoute()

  const fit = useFitLayout(viewMode, gridSize)
  const perPage = fit.count

  // When the fit changes (resize, grid size), stay near the same books
  const prevPerPage = useRef(perPage)
  useEffect(() => {
    const prev = prevPerPage.current
    prevPerPage.current = perPage
    if (prev > 0 && perPage > 0 && prev !== perPage) {
      setPage(Math.floor(((page - 1) * prev) / perPage) + 1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perPage])

  const queryKey = ['books', filters, page, perPage]
  const { data, isFetching, isError, error } = useQuery({
    queryKey,
    queryFn: () =>
      api.getBooks({
        page,
        per_page: perPage,
        q: filters.q || undefined,
        format: filters.format || undefined,
        tag: filters.tag || undefined,
        series: filters.series || undefined,
        sort: filters.sort,
        order: filters.order,
      }),
    enabled: perPage > 0,
    placeholderData: prev => prev,
    // Keep checking while a book on this page is being cleaned, so its
    // indicator clears as soon as the cleanup finishes
    refetchInterval: q => (q.state.data?.books.some(b => b.cleaning) ? 2000 : false),
  })

  const books = data?.books ?? []
  const pages = data?.pages ?? 1

  // Keep the page in range if the library shrank or the fit grew
  useEffect(() => {
    if (data && page > data.pages && data.pages > 0) setPage(data.pages)
  }, [data, page, setPage])

  useEffect(() => {
    setVisibleBookIds((data?.books ?? []).map(b => b.id))
  }, [data?.books, setVisibleBookIds])

  const pageNumbers = getPageNumbers(page, pages)

  if (selectedBookId !== null) {
    return <BookPage key={selectedBookId} bookId={selectedBookId} onClose={closeBook} onDelete={closeBook} />
  }

  return (
    // Exactly one screen tall (minus the mobile header) so the books fit
    // without scrolling and the pager sits on the bottom edge
    <div className="h-[calc(100dvh-3.5rem)] lg:h-dvh flex flex-col">
      <FilterBar />

      <div ref={fit.areaRef} className="relative flex-1 min-h-0 overflow-y-auto px-4 py-4">
        {isFetching && books.length > 0 && (
          <div className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 z-10 rounded-full bg-surface-card border border-line p-1.5 shadow">
            <Loader2 className="w-4 h-4 text-accent animate-spin" />
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center justify-center py-20 text-ink-muted">
            <p className="text-sm">{(error as Error).message}</p>
          </div>
        )}

        {isFetching && books.length === 0 && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-accent animate-spin" />
          </div>
        )}

        {!isFetching && books.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-ink-muted">
            <BookOpen className="w-16 h-16 opacity-30" />
            <p className="text-base font-medium">No books found</p>
            <p className="text-sm">
              {filters.q || filters.format || filters.tag || filters.series
                ? 'Try clearing your filters.'
                : 'Upload some books to get started.'}
            </p>
          </div>
        )}

        {viewMode === 'grid' && books.length > 0 && (
          <div
            ref={fit.itemsRef}
            className="grid gap-3 justify-center"
            style={{
              gridTemplateColumns: fit.grid
                ? `repeat(${fit.grid.cols}, ${fit.grid.cardW}px)`
                : `repeat(auto-fill, minmax(${gridSize}px, 1fr))`,
            }}
          >
            {books.map(book => (
              <BookCard key={book.id} book={book} onClick={() => setSelectedBookId(book.id)} />
            ))}
          </div>
        )}

        {viewMode === 'list' && books.length > 0 && (
          <div ref={fit.itemsRef} className="space-y-1">
            {books.map(book => (
              <BookListItem key={book.id} book={book} onClick={() => setSelectedBookId(book.id)} />
            ))}
          </div>
        )}
      </div>

      {pages > 1 && books.length > 0 && (
        <nav
          aria-label="Pagination"
          className="shrink-0 bg-surface border-t border-line px-4 py-1.5 flex items-center justify-center gap-1"
        >
          <button
            className="btn-outline !px-1.5 !py-1 disabled:opacity-40"
            onClick={() => setPage(page - 1)}
            disabled={page <= 1}
            aria-label="Previous page"
          >
            <ChevronLeft size={14} />
          </button>

          {pageNumbers.map((p, i) =>
            p === '…' ? (
              <span key={`ellipsis-${i}`} className="px-1 text-ink-faint text-sm select-none">…</span>
            ) : (
              <button
                key={p}
                onClick={() => setPage(p as number)}
                className={[
                  'min-w-[1.875rem] px-1.5 py-1 rounded text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                  page === p
                    ? 'bg-accent text-white font-medium'
                    : 'border border-line text-ink-muted hover:border-line-strong hover:text-ink',
                ].join(' ')}
              >
                {p}
              </button>
            )
          )}

          <button
            className="btn-outline !px-1.5 !py-1 disabled:opacity-40"
            onClick={() => setPage(page + 1)}
            disabled={page >= pages}
            aria-label="Next page"
          >
            <ChevronRight size={14} />
          </button>
        </nav>
      )}
    </div>
  )
}
