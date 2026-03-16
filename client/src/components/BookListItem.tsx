import { useState, useRef, useEffect } from 'react'
import { BookOpen, MoreVertical, Download, Send } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Book, EmailAddress } from '../types'
import * as api from '../api/client'
import SendDialog from './SendDialog'

interface BookListItemProps {
  book: Book
  onClick: () => void
}

function formatFileSize(bytes: number | null): string {
  if (bytes === null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return iso
  }
}

export default function BookListItem({ book, onClick }: BookListItemProps) {
  const [imgError, setImgError] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [sendOpen, setSendOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const coverUrl = book.cover_filename && !imgError
    ? `/api/books/${book.id}/cover`
    : null

  const badge = book.file_format
    ? book.file_format.toUpperCase().replace('.', '')
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

  return (
    <>
      <div
        className={[
          'group w-full flex items-center gap-3 px-3 py-2.5 text-left',
          'rounded-lg border border-transparent',
          'hover:bg-surface-raised hover:border-line',
          'transition-colors duration-150',
          'min-w-0 relative',
        ].join(' ')}
      >
        {/* Main clickable area */}
        <div
          role="button"
          tabIndex={0}
          onClick={onClick}
          onKeyDown={e => e.key === 'Enter' && onClick()}
          className="flex items-center gap-3 flex-1 min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
          aria-label={`Open ${book.title ?? book.filename}`}
        >
          {/* Thumbnail */}
          <div className="shrink-0 w-10 h-[60px] rounded overflow-hidden bg-surface-raised border border-line flex items-center justify-center">
            {coverUrl ? (
              <img
                src={coverUrl}
                alt=""
                onError={() => setImgError(true)}
                className="w-full h-full object-cover"
                loading="lazy"
                draggable={false}
              />
            ) : (
              <BookOpen size={18} className="text-ink-faint" />
            )}
          </div>

          {/* Title + Author */}
          <div className="flex-1 min-w-0 flex flex-col gap-0.5">
            <p className="text-ink text-sm font-medium leading-snug truncate">
              {book.title ?? book.filename}
            </p>
            {book.author && (
              <p className="text-ink-muted text-xs truncate">{book.author}</p>
            )}
          </div>

          {/* Series info */}
          {book.series && (
            <div className="hidden md:flex flex-col items-start shrink-0 w-36">
              <p className="text-ink-muted text-xs truncate w-full" title={book.series}>
                {book.series}
                {book.series_order != null && (
                  <span className="ml-1 text-ink-faint">#{book.series_order}</span>
                )}
              </p>
            </div>
          )}

          {/* Format badge */}
          {badge && (
            <span className="hidden sm:inline-flex shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide uppercase bg-surface-high text-ink-muted border border-line">
              {badge}
            </span>
          )}

          {/* File size */}
          {book.file_size != null && (
            <span className="hidden sm:inline text-ink-muted text-xs shrink-0 w-16 text-right">
              {formatFileSize(book.file_size)}
            </span>
          )}

          {/* Date added */}
          {book.date_added && (
            <span className="hidden lg:inline text-ink-muted text-xs shrink-0 w-28 text-right">
              {formatDate(book.date_added)}
            </span>
          )}
        </div>

        {/* Three-dot menu — always visible */}
        <div ref={menuRef} className="relative shrink-0" onClick={e => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => setMenuOpen(v => !v)}
            className="w-7 h-7 flex items-center justify-center rounded text-ink-muted hover:text-ink hover:bg-surface-high transition-colors"
            aria-label="Book actions"
          >
            <MoreVertical size={15} />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-0.5 w-44 bg-surface-raised border border-line rounded-lg shadow-xl py-1 z-50">
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
