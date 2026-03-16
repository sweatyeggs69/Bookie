import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Search, AlertCircle } from 'lucide-react'
import * as api from '../api/client'
import { Book, MetaResult } from '../types'
import Dialog from './Dialog'
import Spinner from './Spinner'

interface MetaDialogProps {
  bookId: number
  bookTitle: string
  onClose: () => void
  onApplied: (book: Book) => void
}

function SourceBadge({ source }: { source: string }) {
  const label = source === 'google_books' ? 'Google Books' : source
  return (
    <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide uppercase bg-surface-high text-ink-muted border border-line">
      {label}
    </span>
  )
}

export default function MetaDialog({ bookId, bookTitle, onClose, onApplied }: MetaDialogProps) {
  const [query, setQuery] = useState(bookTitle)
  const [results, setResults] = useState<MetaResult[] | null>(null)
  const [applyingIndex, setApplyingIndex] = useState<number | null>(null)
  const [applyError, setApplyError] = useState<string | null>(null)

  const searchMutation = useMutation({
    mutationFn: () => api.searchMeta(query.trim()),
    onSuccess: (data) => {
      setResults(data)
    },
  })

  const applyMutation = useMutation({
    mutationFn: (result: MetaResult) => api.applyMeta(bookId, result),
    onSuccess: (book) => {
      setApplyingIndex(null)
      onApplied(book)
    },
    onError: () => {
      setApplyingIndex(null)
      setApplyError('Failed to apply metadata. Please try again.')
    },
  })

  const handleSearch = (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!query.trim()) return
    setResults(null)
    setApplyError(null)
    searchMutation.mutate()
  }

  const handleApply = (result: MetaResult, index: number) => {
    setApplyingIndex(index)
    setApplyError(null)
    applyMutation.mutate(result)
  }

  return (
    <Dialog open onClose={onClose} title="Find Metadata" wide>
      <div className="p-5 flex flex-col gap-4">
        {/* Search input */}
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by title, author, ISBN…"
              autoFocus
              className="w-full pl-9 pr-3 py-2 rounded bg-surface-raised border border-line text-ink text-sm placeholder:text-ink-faint focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={searchMutation.isPending || !query.trim()}
            className="flex items-center gap-1.5 px-4 py-2 rounded bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60"
          >
            {searchMutation.isPending ? <Spinner size={14} className="text-white" /> : <Search size={14} />}
            Search
          </button>
        </form>

        {/* Loading */}
        {searchMutation.isPending && (
          <div className="flex justify-center py-10">
            <Spinner size={28} />
          </div>
        )}

        {/* Search error */}
        {searchMutation.isError && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-danger/10 border border-danger/30 text-danger text-sm">
            <AlertCircle size={16} />
            Failed to search for metadata. Please try again.
          </div>
        )}

        {/* Apply error */}
        {applyError && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-danger/10 border border-danger/30 text-danger text-sm">
            <AlertCircle size={16} />
            {applyError}
          </div>
        )}

        {/* No results */}
        {results !== null && results.length === 0 && !searchMutation.isPending && (
          <div className="flex flex-col items-center gap-2 py-10 text-ink-muted">
            <Search size={28} className="opacity-40" />
            <p className="text-sm">No results found. Try a different query.</p>
          </div>
        )}

        {/* Results */}
        {results !== null && results.length > 0 && (
          <div className="flex flex-col gap-2">
            {results.map((result, i) => {
              const isApplying = applyingIndex === i
              const isAnyApplying = applyingIndex !== null

              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => !isAnyApplying && handleApply(result, i)}
                  disabled={isAnyApplying}
                  className={[
                    'group flex items-start gap-3 w-full p-3 rounded-lg text-left',
                    'bg-surface-raised border border-line',
                    'hover:border-accent/50 hover:bg-surface-high',
                    'active:bg-surface-high',
                    'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                    isAnyApplying && !isApplying ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
                  ].join(' ')}
                >
                  {/* Cover thumbnail */}
                  <div className="shrink-0 w-12 h-[72px] rounded overflow-hidden bg-surface-high border border-line flex items-center justify-center">
                    {result.cover_url ? (
                      <img
                        src={result.cover_url}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                        draggable={false}
                        onError={e => {
                          (e.target as HTMLImageElement).style.display = 'none'
                        }}
                      />
                    ) : (
                      <Search size={16} className="text-ink-faint" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0 flex flex-col gap-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-ink text-sm font-medium leading-snug line-clamp-2">
                        {result.title ?? 'Unknown Title'}
                      </p>
                      <SourceBadge source={result.source} />
                    </div>
                    {result.author && (
                      <p className="text-ink-muted text-xs truncate">{result.author}</p>
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                      {result.published_date && (
                        <span className="text-ink-faint text-xs">
                          {result.published_date.slice(0, 4)}
                        </span>
                      )}
                      {result.publisher && (
                        <span className="text-ink-faint text-xs truncate">{result.publisher}</span>
                      )}
                      {result.isbn13 && (
                        <span className="text-ink-faint text-xs font-mono">{result.isbn13}</span>
                      )}
                    </div>
                    {result.description && (
                      <p className="text-ink-muted text-xs line-clamp-2 mt-0.5">{result.description}</p>
                    )}
                  </div>

                  {/* Apply indicator */}
                  {isApplying && (
                    <div className="shrink-0 flex items-center self-center">
                      <Spinner size={16} />
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </Dialog>
  )
}
