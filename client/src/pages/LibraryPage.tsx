import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, BookOpen, ChevronLeft, ChevronRight } from 'lucide-react'
import { useStore } from '../store'
import * as api from '../api/client'
import FilterBar from '../components/FilterBar'
import BookCard from '../components/BookCard'
import BookListItem from '../components/BookListItem'
import BookPage from './BookPage'
import { useIsPhone, clampSize, PHONE_RANGE, DESKTOP_RANGE } from '../gridSize'

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

const GRID_GAP = 12 // gap-3
const AREA_PADDING = 16 // px-4 py-4 on the content area
const LIST_GAP = 4 // space-y-1
// Height of the title and author block under each cover. BookCard gives it
// this fixed height, so a card's size follows from its width alone and the
// grid never has to measure a rendered card.
const CARD_INFO_H = 73
const CARD_BORDER = 2 // 1px border on each side

// The library shows exactly one screen of books, with no scrolling, so the
// page size has to come from the layout. Only the content area is measured;
// its size doesn't depend on the cards, so nothing here can feed back into
// itself.
interface GridLayout { rows: number; cols: number; cardW: number }

function cardHeight(cardW: number) {
  return (cardW - CARD_BORDER) * 1.5 + CARD_INFO_H + CARD_BORDER
}

// Widest card for which `rows` rows fit in height h
function widthForRows(h: number, rows: number) {
  const cardH = (h - GRID_GAP * (rows - 1)) / rows
  return (cardH - CARD_INFO_H - CARD_BORDER) / 1.5 + CARD_BORDER
}

// `target` is the slider's card width. Rows are fitted to the height at about
// that width, squeezing in one more row if the cards only shrink up to 15%
// for it, and as many columns as fit at the resulting width are used.
function gridLayout(w: number, h: number, target: number): GridLayout {
  // Half a pixel of slack so rounding in the browser can't push a row over
  const fitH = h - 0.5
  let rows = Math.max(1, Math.floor((fitH + GRID_GAP) / (cardHeight(target) + GRID_GAP)))
  if (widthForRows(fitH, rows + 1) >= target * 0.85) rows += 1
  // Cards may grow up to 10% past the target to fill the height
  const cardW = Math.max(40, Math.floor(Math.min(widthForRows(fitH, rows), target * 1.1, w)))
  const cols = Math.max(1, Math.floor((w + GRID_GAP) / (cardW + GRID_GAP)))
  return { rows, cols, cardW }
}

// On phones, empty space at the sides is wasted, so the columns stretch to
// fill the width instead.
function phoneLayout(w: number, h: number, target: number): GridLayout {
  const cols = Math.max(1, Math.floor((w + GRID_GAP) / (target + GRID_GAP)))
  const colW = Math.min(w, (w - GRID_GAP * (cols - 1)) / cols)
  const fitH = h - 0.5
  let rows = Math.max(1, Math.floor((fitH + GRID_GAP) / (cardHeight(colW) + GRID_GAP)))
  if (widthForRows(fitH, rows + 1) >= colW * 0.85) rows += 1
  const cardW = Math.max(40, Math.floor(Math.min(colW, widthForRows(fitH, rows))))
  return { rows, cols, cardW }
}

function useFitLayout(viewMode: 'grid' | 'list', target: number, isPhone: boolean) {
  const [area, setArea] = useState<HTMLDivElement | null>(null)
  const [areaSize, setAreaSize] = useState({ w: 0, h: 0 })
  const [items, setItems] = useState<HTMLDivElement | null>(null)
  const [itemH, setItemH] = useState(0)

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

  // List rows vary with font settings, so measure a real one
  useEffect(() => {
    if (!items || viewMode !== 'list') return
    let ro: ResizeObserver | null = null
    const watch = () => {
      ro?.disconnect()
      const first = items.firstElementChild as HTMLElement | null
      if (!first) return
      const update = () => setItemH(first.offsetHeight)
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

  const grid = (isPhone ? phoneLayout : gridLayout)(areaSize.w, areaSize.h, target)
  return { areaRef: setArea, itemsRef: setItems, count: Math.min(grid.rows * grid.cols, 200), grid }
}

export default function LibraryPage() {
  const { filters, page, setPage, viewMode, gridSize, gridSizePhone, setVisibleBookIds } = useStore()
  const isPhone = useIsPhone()
  const target = isPhone ? clampSize(gridSizePhone, PHONE_RANGE) : clampSize(gridSize, DESKTOP_RANGE)
  const { bookId: selectedBookId, open: setSelectedBookId, close: closeBook } = useBookRoute()

  const fit = useFitLayout(viewMode, target, isPhone)
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
          <div className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 z-10 rounded-full bg-surface-card border border-line p-1.5 shadow-sm">
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
                : `repeat(auto-fill, minmax(${target}px, 1fr))`,
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
            className="btn-outline px-1.5! py-1! disabled:opacity-40"
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
                  'min-w-7.5 px-1.5 py-1 rounded text-sm transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent',
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
            className="btn-outline px-1.5! py-1! disabled:opacity-40"
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
