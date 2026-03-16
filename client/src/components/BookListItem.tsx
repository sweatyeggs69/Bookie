import { useState } from 'react'
import { BookOpen } from 'lucide-react'
import { Book } from '../types'

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

  const coverUrl = book.cover_filename && !imgError
    ? `/api/books/${book.id}/cover`
    : null

  const badge = book.file_format
    ? book.file_format.toUpperCase().replace('.', '')
    : null

  return (
    <button
      onClick={onClick}
      className={[
        'group w-full flex items-center gap-3 px-3 py-2.5 text-left',
        'rounded-lg border border-transparent',
        'hover:bg-surface-raised hover:border-line',
        'active:bg-surface-high',
        'transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        'cursor-pointer min-w-0',
      ].join(' ')}
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
        <div className="hidden md:flex flex-col items-start shrink-0 w-36 min-w-0">
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
    </button>
  )
}
