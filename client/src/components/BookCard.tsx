import { useState } from 'react'
import { BookOpen } from 'lucide-react'
import { Book } from '../types'

interface BookCardProps {
  book: Book
  onClick: () => void
}

export default function BookCard({ book, onClick }: BookCardProps) {
  const [imgError, setImgError] = useState(false)

  const coverUrl = book.cover_filename && !imgError
    ? `/api/books/${book.id}/cover`
    : null

  const formatLabel = (fmt: string | null) => {
    if (!fmt) return null
    return fmt.toUpperCase().replace('.', '')
  }

  const badge = formatLabel(book.file_format)

  return (
    <button
      onClick={onClick}
      className={[
        'group relative flex flex-col w-full text-left',
        'rounded-lg overflow-hidden',
        'bg-surface-card border border-line',
        'hover:border-line-strong hover:shadow-lg hover:shadow-black/40',
        'hover:scale-[1.02] active:scale-[0.98]',
        'transition-all duration-200 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        'cursor-pointer',
        // Ensure a reasonable min touch target on mobile
        'min-w-0',
      ].join(' ')}
      aria-label={`Open ${book.title ?? book.filename}`}
    >
      {/* Cover — 2:3 aspect ratio */}
      <div className="relative w-full" style={{ paddingBottom: '150%' }}>
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

          {/* Gradient overlay for readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
        </div>

        {/* Format badge */}
        {badge && (
          <span
            className={[
              'absolute top-2 right-2 z-10',
              'px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide uppercase',
              'bg-black/60 text-ink backdrop-blur-sm',
              'border border-white/10',
            ].join(' ')}
          >
            {badge}
          </span>
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
    </button>
  )
}
