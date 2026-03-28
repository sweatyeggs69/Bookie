import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { BookOpen, Trash2, Save, Image, ChevronDown, Check, AlertCircle } from 'lucide-react'
import * as api from '../api/client'
import { Book, Tag, MetaResult } from '../types'
import Dialog from './Dialog'
import MetaDialog from './MetaDialog'
import CoverDialog from './CoverDialog'
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

interface TagDropdownProps {
  bookId: number
  allTags: Tag[]
  bookTags: string[]
  onTagAdded: (name: string) => void
  onTagRemoved: (tagId: number, name: string) => void
}

function TagDropdown({ allTags, bookTags, onTagAdded, onTagRemoved }: TagDropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const label = 'Add a Tag'

  const handleToggle = (tag: Tag) => {
    if (bookTags.includes(tag.name)) onTagRemoved(tag.id, tag.name)
    else onTagAdded(tag.name)
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center justify-between gap-2 w-full px-3 py-2 rounded bg-surface-raised border border-line text-sm text-ink hover:border-line-strong transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <span className="text-ink-muted">{label}</span>
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
                <button key={tag.id} type="button" onClick={() => handleToggle(tag)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-ink hover:bg-surface-high transition-colors">
                  <span className={['flex items-center justify-center w-4 h-4 rounded border shrink-0', checked ? 'bg-accent border-accent' : 'border-line-strong'].join(' ')}>
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

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: api.getSettings,
    staleTime: 60_000,
  })

  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [publishedDate, setPublishedDate] = useState('')
  const [series, setSeries] = useState('')
  const [seriesOrder, setSeriesOrder] = useState('')
  const [imgError, setImgError] = useState(false)

  // Pending tag changes — only committed when Save is clicked
  const [pendingTagsAdded, setPendingTagsAdded] = useState<string[]>([])
  const [pendingTagsRemoved, setPendingTagsRemoved] = useState<string[]>([])

  // Pending cover — set from CoverDialog selection or metadata result
  // pendingCoverUrl: a remote URL to apply on save
  // pendingCoverFile: a local file to upload on save
  // pendingCoverPreview: object URL for file preview (managed separately)
  const [pendingCoverUrl, setPendingCoverUrl] = useState<string | null>(null)
  const [pendingCoverFile, setPendingCoverFile] = useState<File | null>(null)
  const [pendingCoverPreview, setPendingCoverPreview] = useState<string | null>(null)
  const objectUrlRef = useRef<string | null>(null)

  const [showMetaDialog, setShowMetaDialog] = useState(false)
  const [showCoverDialog, setShowCoverDialog] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => { if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current) }
  }, [])

  // Populate form when book loads (or bookId changes)
  useEffect(() => {
    if (book) {
      setTitle(book.title ?? '')
      setAuthor(book.author ?? '')
      setPublishedDate(book.published_date ?? '')
      setSeries(book.series ?? '')
      setSeriesOrder(book.series_order != null ? String(book.series_order) : '')
      setImgError(false)
      setPendingTagsAdded([])
      setPendingTagsRemoved([])
    }
  }, [book])

  // Derived: tags shown in the UI — server state + pending local changes
  const displayTags = book
    ? [...book.tags.filter(t => !pendingTagsRemoved.includes(t)), ...pendingTagsAdded]
    : []

  function handleTagAdded(name: string) {
    if (pendingTagsRemoved.includes(name)) {
      setPendingTagsRemoved(prev => prev.filter(t => t !== name))
    } else if (!displayTags.includes(name)) {
      setPendingTagsAdded(prev => [...prev, name])
    }
  }

  function handleTagRemoved(_tagId: number, name: string) {
    if (pendingTagsAdded.includes(name)) {
      setPendingTagsAdded(prev => prev.filter(t => t !== name))
    } else {
      setPendingTagsRemoved(prev => [...prev, name])
    }
  }

  function setPendingCover(cover: { url: string } | { file: File }) {
    // Clean up any previous object URL
    if (objectUrlRef.current) { URL.revokeObjectURL(objectUrlRef.current); objectUrlRef.current = null }
    if ('file' in cover) {
      const objUrl = URL.createObjectURL(cover.file)
      objectUrlRef.current = objUrl
      setPendingCoverFile(cover.file)
      setPendingCoverUrl(null)
      setPendingCoverPreview(objUrl)
    } else {
      setPendingCoverFile(null)
      setPendingCoverUrl(cover.url)
      setPendingCoverPreview(cover.url)
    }
    setImgError(false)
  }

  function clearPendingCover() {
    if (objectUrlRef.current) { URL.revokeObjectURL(objectUrlRef.current); objectUrlRef.current = null }
    setPendingCoverFile(null)
    setPendingCoverUrl(null)
    setPendingCoverPreview(null)
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const updated = await api.updateBook(bookId, {
        title: title || null,
        author: author || null,
        published_date: publishedDate || null,
        series: series || null,
        series_order: seriesOrder !== '' ? Number(seriesOrder) : null,
      })
      // Apply pending cover if any
      if (pendingCoverFile) {
        await api.uploadCoverFile(bookId, pendingCoverFile).catch(() => {})
        if (book?.file_format?.toLowerCase() === 'epub') {
          await api.embedCover(bookId).catch(() => {})
        }
      } else if (pendingCoverUrl) {
        await api.setCoverFromUrl(bookId, pendingCoverUrl).catch(() => {})
      }
      // Apply pending tag changes
      for (const name of pendingTagsAdded) {
        await api.addBookTag(bookId, name).catch(() => {})
      }
      for (const name of pendingTagsRemoved) {
        const tagObj = allTags.find(t => t.name === name)
        if (tagObj) await api.removeBookTag(bookId, tagObj.id).catch(() => {})
      }
      // Fetch the book once all writes are done so onSuccess has the final
      // cover_filename and date_modified, not the pre-cover-upload snapshot.
      return api.getBook(bookId)
    },
    onSuccess: (updated) => {
      // Immediately patch text metadata in every active books-list cache so the
      // grid reflects changes as soon as the dialog closes, without waiting for
      // the background refetch to complete.
      qc.setQueriesData<{ books: Book[]; total: number; pages: number; page: number }>(
        { queryKey: ['books'] },
        old => old ? { ...old, books: old.books.map(b => b.id === bookId ? { ...b, ...updated } : b) } : old,
      )
      qc.setQueryData(['book', bookId], updated)
      // Background refetch to pick up cover_filename / tag changes from the server
      qc.invalidateQueries({ queryKey: ['books'] })
      qc.invalidateQueries({ queryKey: ['book', bookId] })
      qc.invalidateQueries({ queryKey: ['tags'] })
      onClose()
    },
    onError: () => {},
  })

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteBook(bookId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['books'] })
      onDelete()
    },
  })

  const handleDelete = () => {
    if (!confirmDelete) { setConfirmDelete(true); return }
    deleteMutation.mutate()
  }

  // Cover preview: pending takes priority, then stored cover
  const coverUrl = pendingCoverPreview
    ?? (book?.cover_filename && !imgError ? `/api/books/${bookId}/cover?t=${book?.date_modified ?? ''}` : null)

  const isSaving = saveMutation.isPending
  const isDeleting = deleteMutation.isPending

  const footer = (
    <div className="flex items-center justify-between gap-3">
      <button
        type="button"
        onClick={handleDelete}
        disabled={isDeleting}
        onBlur={() => setConfirmDelete(false)}
        className={[
          'flex items-center gap-1.5 px-3 py-2 rounded text-sm font-medium',
          'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger',
          confirmDelete ? 'bg-danger text-white hover:bg-danger/80' : 'text-danger border border-danger/40 hover:bg-danger/10',
        ].join(' ')}
      >
        {isDeleting ? <Spinner size={14} /> : <Trash2 size={14} />}
        {confirmDelete ? 'Confirm Delete' : 'Delete'}
      </button>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowMetaDialog(true)}
          className="px-3 py-2 rounded text-sm font-medium text-ink border border-line hover:bg-surface-raised transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Fetch Metadata
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
          <div className="flex items-center justify-center py-16"><Spinner size={32} /></div>
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
            <div className="shrink-0 flex flex-col items-center gap-3 w-1/2 mx-auto sm:mx-0 sm:w-40">
              <div className="w-full aspect-[2/3] rounded-lg overflow-hidden bg-surface-raised border border-line flex items-center justify-center">
                {coverUrl ? (
                  <img
                    src={coverUrl}
                    alt={book.title ?? book.filename}
                    onError={() => { if (!pendingCoverPreview) setImgError(true) }}
                    className="w-full h-full object-cover"
                    draggable={false}
                  />
                ) : (
                  <BookOpen size={40} className="text-ink-faint" />
                )}
              </div>
              {pendingCoverPreview && (
                <div className="flex flex-col items-center gap-1 w-full">
                  <p className="text-[10px] text-accent text-center leading-tight">New cover selected — click Save to apply</p>
                  <button
                    type="button"
                    onClick={clearPendingCover}
                    className="text-[10px] text-ink-muted hover:text-ink underline"
                  >
                    Clear
                  </button>
                </div>
              )}
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
              <div className="grid grid-cols-5 gap-3">
                <div className="col-span-3 flex flex-col gap-1">
                  <label className="text-xs font-medium text-ink-muted uppercase tracking-wide">Title</label>
                  <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Unknown title" className="field" />
                </div>
                <div className="col-span-2 flex flex-col gap-1">
                  <label className="text-xs font-medium text-ink-muted uppercase tracking-wide">Author</label>
                  <input type="text" value={author} onChange={e => setAuthor(e.target.value)} placeholder="Unknown author" className="field" />
                </div>
              </div>

              <div className="grid grid-cols-10 gap-3">
                <div className="col-span-3 flex flex-col gap-1">
                  <label className="text-xs font-medium text-ink-muted uppercase tracking-wide">Year</label>
                  <input type="text" value={publishedDate} onChange={e => setPublishedDate(e.target.value)} placeholder="YYYY" className="field" />
                </div>
                <div className="col-span-5 flex flex-col gap-1">
                  <label className="text-xs font-medium text-ink-muted uppercase tracking-wide">Series</label>
                  <input type="text" value={series} onChange={e => setSeries(e.target.value)} placeholder="Series name" className="field" />
                </div>
                <div className="col-span-2 flex flex-col gap-1">
                  <label className="text-xs font-medium text-ink-muted uppercase tracking-wide">Order</label>
                  <input type="number" value={seriesOrder} onChange={e => setSeriesOrder(e.target.value)} placeholder="—" min={0} step={0.1} className="field" />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-ink-muted uppercase tracking-wide">Tags</label>
                <TagDropdown
                  bookId={bookId} allTags={allTags} bookTags={displayTags}
                  onTagAdded={handleTagAdded}
                  onTagRemoved={handleTagRemoved}
                />
                {displayTags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {displayTags.map(tag => (
                      <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-accent-muted text-accent text-xs font-medium">
                        {tag}
                        <button type="button" onClick={() => handleTagRemoved(-1, tag)}
                          className="hover:text-white transition-colors" aria-label={`Remove tag ${tag}`}>×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {saveMutation.isError && (
                <div className="flex items-center gap-2 text-xs text-danger">
                  <AlertCircle size={12} />
                  Failed to save changes. Please try again.
                </div>
              )}
            </div>
          </div>
        )}

        {/* File info bar — filename + size only */}
        {book && (
          <div className="mx-5 mb-5 px-3 py-2 rounded-lg bg-surface-raised border border-line flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
            <span className="truncate font-mono flex-1 min-w-0">{book.filename}</span>
            <span>{formatFileSize(book.file_size)}</span>
          </div>
        )}
      </Dialog>

      {showCoverDialog && book && (
        <CoverDialog
          bookTitle={book.title ?? undefined}
          bookAuthor={book.author ?? undefined}
          onClose={() => setShowCoverDialog(false)}
          onSelected={cover => { setPendingCover(cover); setShowCoverDialog(false) }}
        />
      )}

      {showMetaDialog && book && (
        <MetaDialog
          bookTitle={book.title ?? book.filename}
          bookAuthor={book.author ?? undefined}
          onClose={() => setShowMetaDialog(false)}
          onApplied={(result: MetaResult) => {
            if (result.title) setTitle(result.title)
            if (result.author) setAuthor(result.author)
            if (result.published_date) setPublishedDate(result.published_date)
            // Apply cover from metadata if setting is on (default: apply unless explicitly disabled)
            const applyCover = settings?.apply_meta_cover !== 'false'
            if (applyCover && result.cover_url) setPendingCover({ url: result.cover_url })
          }}
        />
      )}
    </>
  )
}
