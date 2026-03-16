import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { BookOpen, Trash2, Save, Image, ChevronDown, Check, AlertCircle } from 'lucide-react'
import * as api from '../api/client'
import { Book, Tag } from '../types'
import Dialog from './Dialog'
import MetaDialog from './MetaDialog'
import Spinner from './Spinner'

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

  const { data: book, isLoading, isError } = useQuery<Book>({
    queryKey: ['book', bookId],
    queryFn: () => api.getBook(bookId),
  })

  const { data: allTags = [] } = useQuery<Tag[]>({
    queryKey: ['tags'],
    queryFn: () => api.getTags(),
  })

  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [publishedDate, setPublishedDate] = useState('')
  const [series, setSeries] = useState('')
  const [seriesOrder, setSeriesOrder] = useState('')
  const [imgError, setImgError] = useState(false)
  const [showMetaDialog, setShowMetaDialog] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const coverInputRef = useRef<HTMLInputElement>(null)

  // Populate form when book loads
  useEffect(() => {
    if (book) {
      setTitle(book.title ?? '')
      setAuthor(book.author ?? '')
      setPublishedDate(book.published_date ?? '')
      setSeries(book.series ?? '')
      setSeriesOrder(book.series_order != null ? String(book.series_order) : '')
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

  const coverUploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('cover', file)
      const res = await fetch(`/api/books/${bookId}/cover`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error ?? `Upload failed (HTTP ${res.status})`)
      }
      return res.json() as Promise<Book>
    },
    onSuccess: () => {
      setImgError(false)
      qc.invalidateQueries({ queryKey: ['book', bookId] })
      qc.invalidateQueries({ queryKey: ['books'] })
    },
  })

  const handleCoverFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) coverUploadMutation.mutate(file)
    e.target.value = ''
  }

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

              <input
                ref={coverInputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={handleCoverFileChange}
                tabIndex={-1}
              />
              <button
                type="button"
                onClick={() => coverInputRef.current?.click()}
                disabled={coverUploadMutation.isPending}
                className="flex items-center gap-1.5 w-full justify-center px-3 py-1.5 rounded text-xs font-medium text-ink-muted border border-line hover:bg-surface-raised hover:text-ink transition-colors"
              >
                {coverUploadMutation.isPending ? <Spinner size={12} /> : <Image size={12} />}
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
                  className="w-full px-3 py-2 rounded bg-surface-raised border border-line text-ink text-sm placeholder:text-ink-faint focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
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
                    className="w-full px-3 py-2 rounded bg-surface-raised border border-line text-ink text-sm placeholder:text-ink-faint focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-ink-muted uppercase tracking-wide">Published Date</label>
                  <input
                    type="text"
                    value={publishedDate}
                    onChange={e => setPublishedDate(e.target.value)}
                    placeholder="YYYY-MM-DD"
                    className="w-full px-3 py-2 rounded bg-surface-raised border border-line text-ink text-sm placeholder:text-ink-faint focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
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
                    className="w-full px-3 py-2 rounded bg-surface-raised border border-line text-ink text-sm placeholder:text-ink-faint focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
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
                    className="w-full px-3 py-2 rounded bg-surface-raised border border-line text-ink text-sm placeholder:text-ink-faint focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
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
          <div className="mx-5 mb-5 px-3 py-2 rounded-lg bg-surface-raised border border-line flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
            <span className="truncate font-mono">{book.filename}</span>
            <span>{formatFileSize(book.file_size)}</span>
            {book.date_added && <span>Added {formatDate(book.date_added)}</span>}
          </div>
        )}
      </Dialog>

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
            setImgError(false)
            setShowMetaDialog(false)
          }}
        />
      )}
    </>
  )
}
