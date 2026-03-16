import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { BookOpen, Trash2, Save, Image, ChevronDown, Check, AlertCircle, Download, Star, Send } from 'lucide-react'
import * as api from '../api/client'
import { Book, Tag, EmailAddress } from '../types'
import Dialog from './Dialog'
import MetaDialog from './MetaDialog'
import CoverDialog from './CoverDialog'
import Spinner from './Spinner'
import { useToast } from '../App'

interface BookDialogProps {
  bookId: number
  onClose: () => void
  onDelete: () => void
}

function formatFileSize(bytes: number | null): string {
  if (bytes === null) return 'Unknown size'
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

interface TagDropdownProps {
  bookId: number
  allTags: Tag[]
  bookTags: string[]
  onTagAdded: (name: string) => void
  onTagRemoved: (tagId: number, name: string) => void
}

function TagDropdown({ bookId, allTags, bookTags, onTagAdded, onTagRemoved }: TagDropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const label = bookTags.length === 0
    ? 'None'
    : bookTags.length === 1
      ? bookTags[0]
      : `${bookTags.length} selected`

  const handleToggle = (tag: Tag) => {
    if (bookTags.includes(tag.name)) {
      onTagRemoved(tag.id, tag.name)
    } else {
      onTagAdded(tag.name)
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={[
          'flex items-center justify-between gap-2 w-full px-3 py-2 rounded',
          'bg-surface-raised border border-line text-sm text-ink',
          'hover:border-line-strong transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        ].join(' ')}
      >
        <span className={bookTags.length === 0 ? 'text-ink-muted' : ''}>{label}</span>
        <ChevronDown size={14} className={`text-ink-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-20 left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-lg border border-line bg-surface-raised shadow-xl shadow-black/40">
          {allTags.length === 0 ? (
            <p className="px-3 py-2 text-xs text-ink-muted">No tags available</p>
          ) : (
            allTags.map(tag => {
              const checked = bookTags.includes(tag.name)
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => handleToggle(tag)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-ink hover:bg-surface-high transition-colors"
                >
                  <span className={[
                    'flex items-center justify-center w-4 h-4 rounded border shrink-0',
                    checked ? 'bg-accent border-accent' : 'border-line-strong',
                  ].join(' ')}>
                    {checked && <Check size={10} strokeWidth={3} className="text-white" />}
                  </span>
                  <span className="flex-1 text-left truncate">{tag.name}</span>
                  <span className="text-ink-faint text-xs">{tag.book_count}</span>
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

export default function BookDialog({ bookId, onClose, onDelete }: BookDialogProps) {
  const qc = useQueryClient()
  const { addToast } = useToast()

  const { data: book, isLoading, isError } = useQuery<Book>({
    queryKey: ['book', bookId],
    queryFn: () => api.getBook(bookId),
  })

  const { data: allTags = [] } = useQuery<Tag[]>({
    queryKey: ['tags'],
    queryFn: () => api.getTags(),
  })

  const { data: emailAddresses = [] } = useQuery<EmailAddress[]>({
    queryKey: ['emailAddresses'],
    queryFn: () => api.getEmailAddresses(),
  })

  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [publishedDate, setPublishedDate] = useState('')
  const [series, setSeries] = useState('')
  const [seriesOrder, setSeriesOrder] = useState('')
  const [rating, setRating] = useState<number | null>(null)
  const [hoverRating, setHoverRating] = useState<number | null>(null)
  const [imgError, setImgError] = useState(false)
  const [showMetaDialog, setShowMetaDialog] = useState(false)
  const [showCoverDialog, setShowCoverDialog] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [emailMenuOpen, setEmailMenuOpen] = useState(false)

  const emailMenuRef = useRef<HTMLDivElement>(null)

  // Close email menu on outside click
  useEffect(() => {
    if (!emailMenuOpen) return
    const handleClick = (e: MouseEvent) => {
      if (emailMenuRef.current && !emailMenuRef.current.contains(e.target as Node)) {
        setEmailMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [emailMenuOpen])

  // Populate form when book loads
  useEffect(() => {
    if (book) {
      setTitle(book.title ?? '')
      setAuthor(book.author ?? '')
      setPublishedDate(book.published_date ?? '')
      setSeries(book.series ?? '')
      setSeriesOrder(book.series_order != null ? String(book.series_order) : '')
      setRating(book.rating ?? null)
      setImgError(false)
    }
  }, [book])

  const saveMutation = useMutation({
    mutationFn: () => api.updateBook(bookId, {
      title: title || null,
      author: author || null,
      published_date: publishedDate || null,
      series: series || null,
      series_order: seriesOrder !== '' ? Number(seriesOrder) : null,
      rating: rating,
    }),
    onSuccess: (updated) => {
      qc.setQueryData(['book', bookId], updated)
      qc.invalidateQueries({ queryKey: ['books'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteBook(bookId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['books'] })
      onDelete()
    },
  })

  const addTagMutation = useMutation({
    mutationFn: (name: string) => api.addBookTag(bookId, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['book', bookId] })
      qc.invalidateQueries({ queryKey: ['tags'] })
      qc.invalidateQueries({ queryKey: ['books'] })
    },
  })

  const removeTagMutation = useMutation({
    mutationFn: (tagId: number) => api.removeBookTag(bookId, tagId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['book', bookId] })
      qc.invalidateQueries({ queryKey: ['tags'] })
      qc.invalidateQueries({ queryKey: ['books'] })
    },
  })

  const sendMutation = useMutation({
    mutationFn: (recipient: string) => api.sendBook(bookId, recipient),
    onSuccess: () => {
      setEmailMenuOpen(false)
      addToast('success', 'Book sent!')
    },
    onError: (e: Error) => {
      addToast('error', e.message)
    },
  })

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    deleteMutation.mutate()
  }

  const coverUrl = book?.cover_filename && !imgError
    ? `/api/books/${bookId}/cover`
    : null

  const isSaving = saveMutation.isPending
  const isDeleting = deleteMutation.isPending

  const footer = (
    <div className="flex items-center justify-between gap-3">
      {/* Delete */}
      <button
        type="button"
        onClick={handleDelete}
        disabled={isDeleting}
        onBlur={() => setConfirmDelete(false)}
        className={[
          'flex items-center gap-1.5 px-3 py-2 rounded text-sm font-medium',
          'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger',
          confirmDelete
            ? 'bg-danger text-white hover:bg-danger/80'
            : 'text-danger border border-danger/40 hover:bg-danger/10',
        ].join(' ')}
      >
        {isDeleting ? <Spinner size={14} /> : <Trash2 size={14} />}
        {confirmDelete ? 'Confirm Delete' : 'Delete'}
      </button>

      {/* Right side actions */}
      <div className="flex items-center gap-2">
        {/* Send to email */}
        {emailAddresses.length > 0 && (
          <div ref={emailMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setEmailMenuOpen(v => !v)}
              disabled={sendMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-2 rounded text-sm font-medium text-ink border border-line hover:bg-surface-raised transition-colors"
              title="Send book via email"
            >
              {sendMutation.isPending ? <Spinner size={14} /> : <Send size={14} />}
              Send
            </button>
            {emailMenuOpen && (
              <div className="absolute right-0 bottom-full mb-1 w-52 bg-surface-raised border border-line rounded-lg shadow-xl py-1 z-50">
                {emailAddresses.map(addr => (
                  <button
                    key={addr.id}
                    type="button"
                    onClick={() => sendMutation.mutate(addr.email)}
                    className="flex flex-col w-full px-3 py-2 text-left hover:bg-surface-high transition-colors"
                  >
                    <span className="text-sm text-ink truncate">{addr.label || addr.email}</span>
                    {addr.label && <span className="text-xs text-ink-muted truncate">{addr.email}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => setShowMetaDialog(true)}
          className="px-3 py-2 rounded text-sm font-medium text-ink border border-line hover:bg-surface-raised transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Find Metadata
        </button>
        <button
          type="button"
          onClick={() => saveMutation.mutate()}
          disabled={isSaving}
          className="flex items-center gap-1.5 px-4 py-2 rounded text-sm font-medium bg-accent hover:bg-accent-hover text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60"
        >
          {isSaving ? <Spinner size={14} className="text-white" /> : <Save size={14} />}
          Save
        </button>
      </div>
    </div>
  )

  return (
    <>
      <Dialog open onClose={onClose} title="Book Details" footer={footer} wide>
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Spinner size={32} />
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-ink-muted">
            <AlertCircle size={32} className="text-danger" />
            <p className="text-sm">Failed to load book details.</p>
          </div>
        )}

        {book && (
          <div className="p-5 flex flex-col sm:flex-row gap-6">
            {/* Cover column */}
            <div className="shrink-0 flex flex-col items-center gap-3 sm:w-40">
              <div className="w-full sm:w-40 aspect-[2/3] rounded-lg overflow-hidden bg-surface-raised border border-line flex items-center justify-center">
                {coverUrl ? (
                  <img
                    src={coverUrl}
                    alt={book.title ?? book.filename}
                    onError={() => setImgError(true)}
                    className="w-full h-full object-cover"
                    draggable={false}
                  />
                ) : (
                  <BookOpen size={40} className="text-ink-faint" />
                )}
              </div>

              <button
                type="button"
                onClick={() => setShowCoverDialog(true)}
                className="flex items-center gap-1.5 w-full justify-center px-3 py-1.5 rounded text-xs font-medium text-ink-muted border border-line hover:bg-surface-raised hover:text-ink transition-colors"
              >
                <Image size={12} />
                Change Cover
              </button>
            </div>

            {/* Fields column */}
            <div className="flex-1 min-w-0 flex flex-col gap-4">
              {/* Title */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-ink-muted uppercase tracking-wide">Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Unknown title"
                  className="field"
                />
              </div>

              {/* Author + Published Date */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-ink-muted uppercase tracking-wide">Author</label>
                  <input
                    type="text"
                    value={author}
                    onChange={e => setAuthor(e.target.value)}
                    placeholder="Unknown author"
                    className="field"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-ink-muted uppercase tracking-wide">Published Date</label>
                  <input
                    type="text"
                    value={publishedDate}
                    onChange={e => setPublishedDate(e.target.value)}
                    placeholder="YYYY-MM-DD"
                    className="field"
                  />
                </div>
              </div>

              {/* Series + Series Order */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 flex flex-col gap-1">
                  <label className="text-xs font-medium text-ink-muted uppercase tracking-wide">Series</label>
                  <input
                    type="text"
                    value={series}
                    onChange={e => setSeries(e.target.value)}
                    placeholder="Series name"
                    className="field"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-ink-muted uppercase tracking-wide">Order</label>
                  <input
                    type="number"
                    value={seriesOrder}
                    onChange={e => setSeriesOrder(e.target.value)}
                    placeholder="—"
                    min={0}
                    step={0.1}
                    className="field"
                  />
                </div>
              </div>

              {/* Tags */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-ink-muted uppercase tracking-wide">Tags</label>
                <TagDropdown
                  bookId={bookId}
                  allTags={allTags}
                  bookTags={book.tags}
                  onTagAdded={name => addTagMutation.mutate(name)}
                  onTagRemoved={tagId => removeTagMutation.mutate(tagId)}
                />
                {/* Selected tags display */}
                {book.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {book.tags.map(tag => {
                      const tagObj = allTags.find(t => t.name === tag)
                      return (
                        <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-accent-muted text-accent text-xs font-medium">
                          {tag}
                          <button
                            type="button"
                            onClick={() => tagObj && removeTagMutation.mutate(tagObj.id)}
                            className="hover:text-white transition-colors"
                            aria-label={`Remove tag ${tag}`}
                          >
                            ×
                          </button>
                        </span>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Rating */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-ink-muted uppercase tracking-wide">Rating</label>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map(star => (
                    <button
                      key={star}
                      type="button"
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(null)}
                      onClick={() => setRating(rating === star ? null : star)}
                      className="text-xl leading-none transition-colors focus-visible:outline-none"
                      aria-label={`Rate ${star} star${star > 1 ? 's' : ''}`}
                    >
                      <Star
                        size={18}
                        className={
                          (hoverRating ?? rating ?? 0) >= star
                            ? 'text-yellow-400 fill-yellow-400'
                            : 'text-ink-faint'
                        }
                      />
                    </button>
                  ))}
                  {rating !== null && (
                    <button
                      type="button"
                      onClick={() => setRating(null)}
                      className="ml-1 text-xs text-ink-faint hover:text-ink-muted transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Save error */}
              {saveMutation.isError && (
                <div className="flex items-center gap-2 text-xs text-danger">
                  <AlertCircle size={12} />
                  Failed to save changes. Please try again.
                </div>
              )}
            </div>
          </div>
        )}

        {/* File info bar */}
        {book && (
          <div className="mx-5 mb-5 px-3 py-2 rounded-lg bg-surface-raised border border-line flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
            <span className="truncate font-mono flex-1 min-w-0">{book.filename}</span>
            <span>{formatFileSize(book.file_size)}</span>
            {book.date_added && <span>Added {formatDate(book.date_added)}</span>}
            <a
              href={api.getDownloadUrl(bookId)}
              download
              className="flex items-center gap-1 text-ink-muted hover:text-ink transition-colors shrink-0"
              title="Download file"
            >
              <Download size={12} />
              Download
            </a>
          </div>
        )}
      </Dialog>

      {showCoverDialog && book && (
        <CoverDialog
          bookId={bookId}
          bookTitle={book.title ?? undefined}
          bookAuthor={book.author ?? undefined}
          fileFormat={book.file_format ?? undefined}
          onClose={() => {
            setShowCoverDialog(false)
            setImgError(false)
            qc.invalidateQueries({ queryKey: ['book', bookId] })
          }}
        />
      )}

      {showMetaDialog && book && (
        <MetaDialog
          bookId={bookId}
          bookTitle={book.title ?? book.filename}
          onClose={() => setShowMetaDialog(false)}
          onApplied={(updated) => {
            qc.setQueryData(['book', bookId], updated)
            qc.invalidateQueries({ queryKey: ['books'] })
            setTitle(updated.title ?? '')
            setAuthor(updated.author ?? '')
            setPublishedDate(updated.published_date ?? '')
            setSeries(updated.series ?? '')
            setSeriesOrder(updated.series_order != null ? String(updated.series_order) : '')
            setRating(updated.rating ?? null)
            setImgError(false)
            setShowMetaDialog(false)
          }}
        />
      )}
    </>
  )
}
