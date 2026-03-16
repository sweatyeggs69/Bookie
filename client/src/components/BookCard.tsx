import { useState, useRef, useEffect } from 'react'
import { BookOpen, MoreVertical, Download, Send, Check, CheckSquare } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Book, EmailAddress } from '../types'
import * as api from '../api/client'
import SendDialog from './SendDialog'
import { useStore } from '../store'

interface BookCardProps {
  book: Book
  onClick: () => void
}

export default function BookCard({ book, onClick }: BookCardProps) {
  const [imgError, setImgError] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [sendOpen, setSendOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const { selectionMode, selectedBookIds, toggleBookSelection, selectRangeBooks, lastSelectedId, visibleBookIds, setSearchQuery, setSelectionMode } = useStore()

  const coverUrl = book.cover_filename && !imgError
    ? `/api/books/${book.id}/cover`
    : null

  const isSelected = selectedBookIds.includes(book.id)

  const { data: emailAddresses = [] } = useQuery<EmailAddress[]>({
    queryKey: ['emailAddresses'],
    queryFn: () => api.getEmailAddresses(),
    staleTime: 5 * 60 * 1000,
  })

  useEffect(() => {
    if (!menuOpen) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  const handleCardClick = (e?: React.MouseEvent) => {
    if (selectionMode) {
      if (e?.shiftKey && lastSelectedId !== null) {
        const fromIdx = visibleBookIds.indexOf(lastSelectedId)
        const toIdx = visibleBookIds.indexOf(book.id)
        if (fromIdx !== -1 && toIdx !== -1) {
          const start = Math.min(fromIdx, toIdx)
          const end = Math.max(fromIdx, toIdx)
          selectRangeBooks(visibleBookIds.slice(start, end + 1))
          return
        }
      }
      toggleBookSelection(book.id)
    } else {
      onClick()
    }
  }

  const seriesBadge = book.series_order != null ? `#${book.series_order}` : null

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={e => handleCardClick(e)}
        onKeyDown={e => e.key === 'Enter' && handleCardClick()}
        className={[
          'group relative flex flex-col w-full text-left',
          'rounded-lg overflow-visible',
          'border transition-all duration-200 ease-out',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          'cursor-pointer min-w-0',
          isSelected
            ? 'bg-accent/10 border-accent shadow-lg shadow-accent/20'
            : 'bg-surface-card border-line [@media(hover:hover)]:hover:border-line-strong [@media(hover:hover)]:hover:shadow-md [@media(hover:hover)]:hover:shadow-black/20 [@media(hover:hover)]:hover:scale-[1.02] active:scale-[0.98]',
        ].join(' ')}
        aria-label={`${selectionMode ? 'Select' : 'Open'} ${book.title ?? book.filename}`}
      >
        {/* Cover */}
        <div className="relative w-full rounded-t-lg overflow-hidden" style={{ paddingBottom: '150%' }}>
          <div className="absolute inset-0">
            {coverUrl ? (
              <img src={coverUrl} alt={book.title ?? book.filename} onError={() => setImgError(true)}
                className="w-full h-full object-cover" loading="lazy" draggable={false} />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center bg-surface-raised gap-2">
                <BookOpen size={32} className="text-ink-faint" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent opacity-0 [@media(hover:hover)]:group-hover:opacity-100 transition-opacity duration-200" />
          </div>

          {seriesBadge && (
            <span className="absolute top-2 right-2 z-10 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-black/60 text-white backdrop-blur-sm border border-white/10">
              {seriesBadge}
            </span>
          )}
        </div>

        {/* Selection checkbox — top-left, always visible in selection mode */}
        {selectionMode ? (
          <div className="absolute top-1 left-1 z-20">
            <div className={[
              'w-6 h-6 rounded border-2 flex items-center justify-center',
              isSelected ? 'bg-accent border-accent' : 'bg-black/60 border-white/60',
            ].join(' ')}>
              {isSelected && <Check size={12} strokeWidth={3} className="text-white" />}
            </div>
          </div>
        ) : (
          /* Three-dot menu — on card (overflow-visible), not inside cover */
          <div
            ref={menuRef}
            className="absolute top-1 left-1 z-20"
            onClick={e => e.stopPropagation()}
            onKeyDown={e => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={e => { e.stopPropagation(); setMenuOpen(v => !v) }}
              className="w-7 h-7 flex items-center justify-center rounded bg-black/60 text-white hover:bg-black/80 transition-colors"
              aria-label="Book actions"
            >
              <MoreVertical size={13} />
            </button>

            {menuOpen && (
              <div className="absolute left-0 top-full mt-0.5 w-44 bg-surface-raised border border-line rounded-lg shadow-xl py-1 z-50">
                <button type="button" onClick={() => { setMenuOpen(false); setSelectionMode(true); toggleBookSelection(book.id) }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-ink hover:bg-surface-high transition-colors">
                  <CheckSquare size={14} className="text-ink-muted" /> Select
                </button>
                <a href={api.getDownloadUrl(book.id)} download onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-ink hover:bg-surface-high transition-colors">
                  <Download size={14} className="text-ink-muted" /> Download
                </a>
                {emailAddresses.length > 0 && (
                  <button type="button" onClick={() => { setMenuOpen(false); setSendOpen(true) }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-ink hover:bg-surface-high transition-colors">
                    <Send size={14} className="text-ink-muted" /> Send to…
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Text */}
        <div className="px-2.5 py-2 flex flex-col gap-0.5 min-w-0">
          <p className="text-ink text-sm font-medium leading-snug line-clamp-2 min-h-[2.5em]" title={book.title ?? book.filename}>
            {book.title ?? book.filename}
          </p>
          {book.author && (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); setSearchQuery(book.author!) }}
              className="text-ink-muted text-xs leading-snug truncate text-left [@media(hover:hover)]:hover:text-accent [@media(hover:hover)]:hover:underline transition-colors"
              title={`Filter by ${book.author}`}
            >
              {book.author}
            </button>
          )}
        </div>
      </div>

      {sendOpen && (
        <SendDialog bookId={book.id} bookTitle={book.title} emailAddresses={emailAddresses} onClose={() => setSendOpen(false)} />
      )}
    </>
  )
}
