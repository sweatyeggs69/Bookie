import { useState, useEffect } from 'react'
import { Search, AlertCircle, X, BookOpen } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import * as api from '../api/client'
import { MetaResult } from '../types'
import Dialog from './Dialog'
import Spinner from './Spinner'

interface MetaDialogProps {
  bookTitle: string
  bookAuthor?: string
  onClose: () => void
  onApplied: (result: MetaResult) => void
}

export default function MetaDialog({ bookTitle, bookAuthor, onClose, onApplied }: MetaDialogProps) {
  const [query, setQuery] = useState([bookTitle, bookAuthor].filter(Boolean).join(' '))
  const [results, setResults] = useState<MetaResult[] | null>(null)
  const [previewResult, setPreviewResult] = useState<MetaResult | null>(null)

  const searchMutation = useMutation({
    mutationFn: () => api.searchMeta(query.trim()),
    onSuccess: (data) => setResults(data),
  })

  useEffect(() => {
    if (query.trim()) searchMutation.mutate()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!query.trim()) return
    setResults(null)
    searchMutation.mutate()
  }

  const handleResultClick = (result: MetaResult) => {
    const isTouchDevice = !window.matchMedia('(hover: hover)').matches
    if (isTouchDevice) {
      setPreviewResult(result)
    } else {
      onApplied(result)
      onClose()
    }
  }

  return (
    <Dialog open onClose={onClose} title="Fetch Metadata" wide>
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
              className="field pl-9"
            />
          </div>
          <button
            type="submit"
            disabled={searchMutation.isPending || !query.trim()}
            className="btn-primary"
          >
            {searchMutation.isPending ? <Spinner size={14} className="text-white" /> : <Search size={14} />}
            Search
          </button>
        </form>

        {searchMutation.isPending && (
          <div className="flex justify-center py-10"><Spinner size={28} /></div>
        )}

        {searchMutation.isError && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-danger/10 border border-danger/30 text-danger text-sm">
            <AlertCircle size={16} />
            Failed to search. Please try again.
          </div>
        )}

        {results !== null && results.length === 0 && !searchMutation.isPending && (
          <div className="flex flex-col items-center gap-2 py-10 text-ink-muted">
            <Search size={28} className="opacity-40" />
            <p className="text-sm">No results found. Try a different query.</p>
          </div>
        )}

        {results !== null && results.length > 0 && (
          <div className="flex flex-col gap-2">
            {results.map((result, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleResultClick(result)}
                className={[
                  'group flex items-start gap-3 w-full p-3 rounded-lg text-left',
                  'bg-surface-raised border border-line',
                  'hover:border-accent/50 hover:bg-surface-high',
                  'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer',
                ].join(' ')}
              >
                <div className="shrink-0 w-12 h-[72px] rounded overflow-hidden bg-surface-high border border-line flex items-center justify-center">
                  {result.cover_url ? (
                    <img src={result.cover_url} alt="" className="w-full h-full object-cover" loading="lazy" draggable={false}
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                  ) : (
                    <Search size={16} className="text-ink-faint" />
                  )}
                </div>

                <div className="flex-1 min-w-0 flex flex-col gap-1">
                  <p className="text-ink text-sm font-medium leading-snug line-clamp-2">
                    {result.title ?? 'Unknown Title'}
                  </p>
                  {result.author && <p className="text-ink-muted text-xs truncate">{result.author}</p>}
                  <div className="flex items-center gap-2 flex-wrap">
                    {result.published_date && <span className="text-ink-faint text-xs">{result.published_date.slice(0, 4)}</span>}
                    {result.publisher && <span className="text-ink-faint text-xs truncate">{result.publisher}</span>}
                    {result.isbn13 && <span className="text-ink-faint text-xs font-mono">{result.isbn13}</span>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Mobile tap preview overlay */}
      {previewResult && (
        <div className="absolute inset-0 z-10 flex flex-col bg-surface rounded-b-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-line shrink-0">
            <button
              type="button"
              onClick={() => setPreviewResult(null)}
              className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink transition-colors"
            >
              <X size={16} />
              Back
            </button>
            <button
              type="button"
              onClick={() => { onApplied(previewResult); onClose() }}
              className="btn-primary py-1.5 text-sm"
            >
              Use
            </button>
          </div>

          <div className="p-4 flex gap-4 items-stretch">
            <div className="flex-1 aspect-[2/3] rounded-lg overflow-hidden border border-line bg-surface-raised flex items-center justify-center">
              {previewResult.cover_url ? (
                <img
                  src={previewResult.cover_url}
                  alt={previewResult.title ?? ''}
                  className="w-full h-full object-cover"
                  draggable={false}
                />
              ) : (
                <BookOpen size={24} className="text-ink-faint" />
              )}
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-1 pt-0.5">
              <p className="text-ink font-semibold text-sm leading-snug">{previewResult.title ?? 'Unknown Title'}</p>
              {previewResult.author && <p className="text-ink-muted text-xs">{previewResult.author}</p>}
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-faint mt-1">
                {previewResult.published_date && <span>{previewResult.published_date.slice(0, 4)}</span>}
                {previewResult.publisher && <span>{previewResult.publisher}</span>}
                {previewResult.isbn13 && <span className="font-mono">{previewResult.isbn13}</span>}
              </div>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  )
}
