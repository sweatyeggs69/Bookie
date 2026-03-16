import { useState, useRef, useEffect } from 'react'
import { BookOpen, MoreVertical, Download, Send } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Book, EmailAddress } from '../types'
import * as api from '../api/client'
import SendDialog from './SendDialog'

interface BookCardProps {
  book: Book
  onClick: () => void
}

export default function BookCard({ book, onClick }: BookCardProps) {
  const [imgError, setImgError] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [sendOpen, setSendOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const coverUrl = book.cover_filename && !imgError
    ? `/api/books/${book.id}/cover`
    : null

  const { data: emailAddresses = [] } = useQuery<EmailAddress[]>({
    queryKey: ['emailAddresses'],
    queryFn: () => api.getEmailAddresses(),
    staleTime: 5 * 60 * 1000,
  })

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  const seriesBadge = book.series_order != null ? `#${book.series_order}` : null

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={e => e.key === 'Enter' && onClick()}
        className={[
          'group relative flex flex-col w-full text-left',
          'rounded-lg overflow-visible',
          'bg-surface-card border border-line',
          'hover:border-line-strong hover:shadow-lg hover:shadow-black/40',
          'hover:scale-[1.02] active:scale-[0.98]',
          'transition-all duration-200 ease-out',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          'cursor-pointer min-w-0',
        ].join(' ')}
        aria-label={`Open ${book.title ?? book.filename}`}
      >
        {/* Cover — 2:3 aspect ratio, overflow-hidden only on cover area */}
        <div className="relative w-full rounded-t-lg overflow-hidden" style={{ paddingBottom: '150%' }}>
          <div className="absolute inset-0">
            {coverUrl ? (
              <img
                src={coverUrl}
                alt={book.title ?? book.filename}
                onError={() => setImgError(true)}
                className="w-full h-full object-cover"
                loading="lazy"
                draggable={false}
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center bg-surface-raised gap-2">
                <BookOpen size={32} className="text-ink-faint" />
              </div>
            )}

            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
          </div>

          {/* Series number badge */}
          {seriesBadge && (
            <span className="absolute top-2 right-2 z-10 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-black/60 text-white backdrop-blur-sm border border-white/10">
              {seriesBadge}
            </span>
          )}
        </div>

        {/* Three-dot menu — on the card itself (overflow-visible parent), not inside the cover */}
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
              <a
                href={api.getDownloadUrl(book.id)}
                download
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-ink hover:bg-surface-high transition-colors"
              >
                <Download size={14} className="text-ink-muted" />
                Download
              </a>
              {emailAddresses.length > 0 && (
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); setSendOpen(true) }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-ink hover:bg-surface-high transition-colors"
                >
                  <Send size={14} className="text-ink-muted" />
                  Send to…
                </button>
              )}
            </div>
          )}
        </div>

        {/* Text below cover */}
        <div className="px-2.5 py-2 flex flex-col gap-0.5 min-w-0">
          <p
            className="text-ink text-sm font-medium leading-snug line-clamp-2 min-h-[2.5em]"
            title={book.title ?? book.filename}
          >
            {book.title ?? book.filename}
          </p>
          {book.author && (
            <p
              className="text-ink-muted text-xs leading-snug truncate"
              title={book.author}
            >
              {book.author}
            </p>
          )}
        </div>
      </div>

      {sendOpen && (
        <SendDialog
          bookId={book.id}
          bookTitle={book.title}
          emailAddresses={emailAddresses}
          onClose={() => setSendOpen(false)}
        />
      )}
    </>
  )
}
