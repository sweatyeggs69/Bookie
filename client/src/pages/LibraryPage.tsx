import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, BookOpen } from 'lucide-react'
import { useStore } from '../store'
import * as api from '../api/client'
import FilterBar from '../components/FilterBar'
import BookCard from '../components/BookCard'
import BookListItem from '../components/BookListItem'
import BookDialog from '../components/BookDialog'

export default function LibraryPage() {
  const { filters, page, setPage, viewMode, gridSize, selectedBookId, setSelectedBookId } = useStore()

  const queryKey = ['books', filters, page]
  const { data, isFetching, isError, error } = useQuery({
    queryKey,
    queryFn: () =>
      api.getBooks({
        page,
        per_page: 40,
        q: filters.q || undefined,
        format: filters.format || undefined,
        tag: filters.tag || undefined,
        sort: filters.sort,
        order: filters.order,
      }),
    placeholderData: prev => prev,
  })

  const books = data?.books ?? []
  const total = data?.total ?? 0
  const pages = data?.pages ?? 1

  return (
    <div className="flex flex-col h-full">
      <FilterBar />

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {/* Loading overlay for transitions */}
        {isFetching && books.length > 0 && (
          <div className="flex justify-center mb-3">
            <Loader2 className="w-5 h-5 text-accent animate-spin" />
          </div>
        )}

        {/* Error */}
        {isError && (
          <div className="flex flex-col items-center justify-center py-20 text-ink-muted">
            <p className="text-sm">{(error as Error).message}</p>
          </div>
        )}

        {/* Initial loading */}
        {isFetching && books.length === 0 && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-accent animate-spin" />
          </div>
        )}

        {/* Empty state */}
        {!isFetching && books.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-ink-muted">
            <BookOpen className="w-16 h-16 opacity-30" />
            <p className="text-base font-medium">No books found</p>
            <p className="text-sm">
              {filters.q || filters.format || filters.tag
                ? 'Try clearing your filters.'
                : 'Upload some books to get started.'}
            </p>
          </div>
        )}

        {/* Grid view */}
        {viewMode === 'grid' && books.length > 0 && (
          <div
            className="grid gap-3"
            style={{
              gridTemplateColumns: `repeat(auto-fill, minmax(${gridSize}px, 1fr))`,
            }}
          >
            {books.map(book => (
              <BookCard
                key={book.id}
                book={book}
                onClick={() => setSelectedBookId(book.id)}
              />
            ))}
          </div>
        )}

        {/* List view */}
        {viewMode === 'list' && books.length > 0 && (
          <div className="space-y-1">
            {books.map(book => (
              <BookListItem
                key={book.id}
                book={book}
                onClick={() => setSelectedBookId(book.id)}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-6 pb-4">
            <button
              className="btn-outline px-4 py-1.5 text-sm disabled:opacity-40"
              onClick={() => setPage(page - 1)}
              disabled={page <= 1}
            >
              Previous
            </button>
            <span className="text-sm text-ink-muted">
              Page {page} of {pages}
              {total > 0 && <span className="ml-2 text-ink-faint">({total.toLocaleString()} books)</span>}
            </span>
            <button
              className="btn-outline px-4 py-1.5 text-sm disabled:opacity-40"
              onClick={() => setPage(page + 1)}
              disabled={page >= pages}
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Book detail dialog */}
      {selectedBookId !== null && (
        <BookDialog
          bookId={selectedBookId}
          onClose={() => setSelectedBookId(null)}
          onDelete={() => setSelectedBookId(null)}
        />
      )}
    </div>
  )
}
