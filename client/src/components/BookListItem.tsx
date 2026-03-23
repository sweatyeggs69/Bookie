import { useState, useRef, useEffect } from 'react'
import { BookOpen, MoreVertical, Download, Send, Check, CheckSquare, MoreHorizontal } from 'lucide-react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Book, EmailAddress } from '../types'
import * as api from '../api/client'
import SendDialog from './SendDialog'
import { useStore } from '../store'
import { useToast } from '../contexts/toast'

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
  const { selectionMode, selectedBookIds, toggleBookSelection, selectRangeBooks, lastSelectedId, visibleBookIds, setSearchQuery, setSelectionMode } = useStore()

  const coverUrl = book.cover_filename && !imgError
    ? `/api/books/${book.id}/cover?t=${book.date_modified ?? ''}`
    : null

  const badge = book.file_format ? book.file_format.toUpperCase().replace('.', '') : null
  const isSelected = selectedBookIds.includes(book.id)

  const { addToast } = useToast()

  const { data: emailAddresses = [] } = useQuery<EmailAddress[]>({
    queryKey: ['emailAddresses'],
    queryFn: () => api.getEmailAddresses(),
    staleTime: 5 * 60 * 1000,
  })

  const quickSendMutation = useMutation({
    mutationFn: () => api.sendBook(book.id, emailAddresses[0]?.email),
    onSuccess: () => addToast('success', 'Book sent!'),
    onError: (e: Error) => addToast('error', e.message),
  })

  useEffect(() => {
    if (!menuOpen) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  const handleRowClick = (e?: React.MouseEvent) => {
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

  return (
    <>
      <div
        className={[
          'group w-full flex items-center gap-2 px-3 py-2.5 text-left rounded-lg border transition-colors duration-150 min-w-0 relative',
          isSelected
            ? 'bg-accent/10 border-accent/40'
            : 'border-transparent hover:bg-surface-raised hover:border-line',
        ].join(' ')}
      >
        {/* Checkbox in selection mode */}
        {selectionMode && (
          <button
            type="button"
            onClick={e => handleRowClick(e)}
            className={[
              'shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors',
              isSelected ? 'bg-accent border-accent' : 'border-line-strong hover:border-accent',
            ].join(' ')}
            aria-label={isSelected ? 'Deselect' : 'Select'}
          >
            {isSelected && <Check size={11} strokeWidth={3} className="text-white" />}
          </button>
        )}

        {/* Main clickable area */}
        <div
          role="button"
          tabIndex={0}
          onClick={e => handleRowClick(e)}
          onKeyDown={e => e.key === 'Enter' && handleRowClick()}
          className="flex items-center gap-3 flex-1 min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded cursor-pointer"
          aria-label={`Open ${book.title ?? book.filename}`}
        >
          {/* Thumbnail */}
          <div className="shrink-0 w-10 h-[60px] rounded overflow-hidden bg-surface-raised border border-line flex items-center justify-center">
            {coverUrl ? (
              <img src={coverUrl} alt="" onError={() => setImgError(true)}
                className="w-full h-full object-cover" loading="lazy" draggable={false} />
            ) : (
              <BookOpen size={18} className="text-ink-faint" />
            )}
          </div>

          {/* Title + Author */}
          <div className="flex-1 min-w-0 flex flex-col gap-0.5">
            <p className="text-ink text-sm font-medium leading-snug truncate">{book.title ?? book.filename}</p>
            {book.author && (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); setSearchQuery(book.author!) }}
                className="text-ink-muted text-xs truncate text-left [@media(hover:hover)]:hover:text-accent [@media(hover:hover)]:hover:underline transition-colors"
                title={`Filter by ${book.author}`}
              >
                {book.author}
              </button>
            )}
          </div>

          {/* Series */}
          {book.series && (
            <div className="hidden md:flex flex-col items-start shrink-0 w-36">
              <p className="text-ink-muted text-xs truncate w-full" title={book.series}>
                {book.series}
                {book.series_order != null && <span className="ml-1 text-ink-faint">#{book.series_order}</span>}
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

        {/* Three-dot menu — hidden in selection mode */}
        {!selectionMode && (
          <div ref={menuRef} className="relative shrink-0" onClick={e => e.stopPropagation()}>
            <button type="button" onClick={() => setMenuOpen(v => !v)}
              className="w-7 h-7 flex items-center justify-center rounded text-ink-muted hover:text-ink hover:bg-surface-high transition-colors"
              aria-label="Book actions">
              <MoreVertical size={15} />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-0.5 w-44 bg-surface-raised border border-line rounded-lg shadow-xl py-1 z-50">
                <button type="button" onClick={() => { setMenuOpen(false); setSelectionMode(true); toggleBookSelection(book.id) }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-ink hover:bg-surface-high transition-colors">
                  <CheckSquare size={14} className="text-ink-muted" /> Select
                </button>
                <a href={api.getDownloadUrl(book.id)} download onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-ink hover:bg-surface-high transition-colors">
                  <Download size={14} className="text-ink-muted" /> Download
                </a>
                {emailAddresses.length > 0 && (
                  <div className="flex items-stretch">
                    <button type="button" onClick={() => { setMenuOpen(false); quickSendMutation.mutate() }}
                      className="flex items-center gap-2 flex-[3] px-3 py-2 text-sm text-ink hover:bg-surface-high transition-colors">
                      <Send size={14} className="text-ink-muted" /> Send
                    </button>
                    <button type="button" onClick={() => { setMenuOpen(false); setSendOpen(true) }}
                      className="flex items-center justify-center flex-1 px-2 py-2 text-ink-muted hover:text-ink hover:bg-surface-high transition-colors border-l border-line"
                      aria-label="Choose recipient">
                      <MoreHorizontal size={14} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {sendOpen && (
        <SendDialog bookId={book.id} bookTitle={book.title} emailAddresses={emailAddresses} onClose={() => setSendOpen(false)} />
      )}
    </>
  )
}
