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

export default function LibraryPage() {
  const { filters, page, setPage, perPage, viewMode, gridSize, setVisibleBookIds } = useStore()
  const { bookId: selectedBookId, open: setSelectedBookId, close: closeBook } = useBookRoute()

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
    placeholderData: prev => prev,
    // Keep checking while a book on this page is being cleaned, so its
    // indicator clears as soon as the cleanup finishes
    refetchInterval: q => (q.state.data?.books.some(b => b.cleaning) ? 2000 : false),
  })

  const books = data?.books ?? []
  const pages = data?.pages ?? 1

  useEffect(() => {
    setVisibleBookIds((data?.books ?? []).map(b => b.id))
  }, [data?.books, setVisibleBookIds])

  const pageNumbers = getPageNumbers(page, pages)

  if (selectedBookId !== null) {
    return <BookPage key={selectedBookId} bookId={selectedBookId} onClose={closeBook} onDelete={closeBook} />
  }

  return (
    <div>
      <FilterBar />

      <div className="px-4 py-4">
        {isFetching && books.length > 0 && (
          <div className="flex justify-center mb-3">
            <Loader2 className="w-5 h-5 text-accent animate-spin" />
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
            className="grid gap-3"
            style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${gridSize}px, 1fr))` }}
          >
            {books.map(book => (
              <BookCard key={book.id} book={book} onClick={() => setSelectedBookId(book.id)} />
            ))}
          </div>
        )}

        {viewMode === 'list' && books.length > 0 && (
          <div className="space-y-1">
            {books.map(book => (
              <BookListItem key={book.id} book={book} onClick={() => setSelectedBookId(book.id)} />
            ))}
          </div>
        )}

        {pages > 1 && books.length > 0 && (
          <div className="flex items-center justify-center gap-1 mt-6 pb-6">
            <button
              className="btn-outline !px-2 !py-1.5 disabled:opacity-40"
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
                    'min-w-[2rem] px-2 py-1.5 rounded text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
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
              className="btn-outline !px-2 !py-1.5 disabled:opacity-40"
              onClick={() => setPage(page + 1)}
              disabled={page >= pages}
              aria-label="Next page"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>

    </div>
  )
}
