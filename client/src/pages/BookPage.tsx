import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { BookOpen, Trash2, Save, Image, ChevronDown, Check, AlertCircle, Sparkles, ArrowLeft, Search } from 'lucide-react'
import * as api from '../api/client'
import { Book, Tag, MetaResult } from '../types'
import MetaDialog from '../components/MetaDialog'
import CoverDialog from '../components/CoverDialog'
import Spinner from '../components/Spinner'
import { useToast } from '../contexts/toast'

interface BookPageProps {
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

function formatDate(iso: string | null | undefined): string {
  if (!iso) return 'Unknown'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? 'Unknown' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatProgressSource(device: string | null, timestamp: number | null): string {
  const when = timestamp
    ? new Date(timestamp * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : null
  return [device && `on ${device}`, when].filter(Boolean).join(', ')
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
        <span className={`truncate ${bookTags.length > 0 ? 'text-ink' : 'text-ink-muted'}`}>
          {bookTags.length > 0 ? bookTags.join(', ') : 'Add a Tag'}
        </span>
        <ChevronDown size={14} className={`text-ink-muted shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
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

export default function BookPage({ bookId, onClose, onDelete }: BookPageProps) {
  const qc = useQueryClient()
  const { addToast } = useToast()

  const { data: book, isLoading, isError } = useQuery<Book>({
    queryKey: ['book', bookId],
    queryFn: () => api.getBook(bookId),
    // Poll while a cleanup runs (on upload or from the library) until it's done
    refetchInterval: q => (q.state.data?.cleaning ? 2000 : false),
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

  // Escape goes back to the library, unless a picker dialog or a text field has focus
  useEffect(() => {
    if (showMetaDialog || showCoverDialog) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [showMetaDialog, showCoverDialog, onClose])

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
      clearPendingCover()
      addToast('success', 'Changes saved')
    },
    onError: () => {},
  })

  const cleanupMutation = useMutation({
    mutationFn: () => api.cleanupBook(bookId),
    onSuccess: ({ actions, book: cleaned }) => {
      qc.setQueryData(['book', bookId], cleaned)
      qc.invalidateQueries({ queryKey: ['books'] })
      addToast('success', actions.length ? `Cleaned up: ${actions.join('; ')}` : 'Nothing to clean up')
    },
    onError: (e: Error) => addToast('error', e.message),
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
  // Editing is locked while the file is being cleaned and until the refreshed book arrives
  const isCleaning = cleanupMutation.isPending || !!book?.cleaning

  const displayTitle = book ? (book.title || book.filename) : 'Book Details'
  const fileFormat = book?.file_format?.toUpperCase()

  return (
    <>
      <div className="max-w-6xl px-4 py-6 md:px-8 md:py-8">
        <button
          type="button"
          onClick={onClose}
          className="mb-4 -ml-1 inline-flex items-center gap-1 rounded-lg px-1 py-0.5 text-sm font-medium text-ink-muted hover:text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <ArrowLeft size={16} />
          Library
        </button>

        {/* Page header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold text-ink break-words">{displayTitle}</h1>
            {book && (
              <p className="mt-2 text-base text-ink-muted truncate">
                {book.author || 'Unknown author'}
                {book.series && <span> · {book.series}{book.series_order != null && ` #${book.series_order}`}</span>}
              </p>
            )}
          </div>

          {book && (
            <div className="grid grid-cols-3 gap-2 sm:flex sm:items-center shrink-0">
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting || isCleaning}
                onBlur={() => setConfirmDelete(false)}
                className={[
                  'inline-flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-sm font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger disabled:opacity-60',
                  confirmDelete ? 'bg-danger text-white hover:bg-danger/80' : 'text-danger border border-danger/40 hover:bg-danger/10',
                ].join(' ')}
              >
                {isDeleting ? <Spinner size={14} /> : <Trash2 size={14} />}
                {confirmDelete ? 'Confirm Delete' : 'Delete'}
              </button>
              <button
                type="button"
                onClick={() => setShowMetaDialog(true)}
                disabled={isCleaning}
                className="btn-outline justify-center px-3 sm:px-4"
              >
                <Search size={14} />
                <span className="sm:hidden">Metadata</span>
                <span className="hidden sm:inline">Fetch Metadata</span>
              </button>
              <button
                type="button"
                onClick={() => saveMutation.mutate()}
                disabled={isSaving || isCleaning}
                className="btn-primary justify-center px-3 sm:px-4"
              >
                {isSaving ? <Spinner size={14} className="text-white" /> : <Save size={14} />}
                Save
              </button>
            </div>
          )}
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-24"><Spinner size={32} /></div>
        )}

        {isError && (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-ink-muted">
            <AlertCircle size={32} className="text-danger" />
            <p className="text-sm">Failed to load book details.</p>
          </div>
        )}

        {book && isCleaning && (
          <div role="status" className="mb-6 flex items-center gap-2 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-ink">
            <Spinner size={14} />
            Cleaning up this EPUB. Editing is paused until it finishes.
          </div>
        )}

        {book && (
          <fieldset
            disabled={isCleaning}
            className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-[15rem_minmax(0,1fr)] lg:grid-cols-[18rem_minmax(0,1fr)] min-w-0 disabled:opacity-60"
          >
            {/* Cover art. Shares a grid row with the details card, so both are the same height. */}
            <div className="w-56 max-w-full mx-auto md:w-full md:col-start-1 md:row-start-1">
              <div className="w-full aspect-[2/3] rounded-xl overflow-hidden bg-surface-raised border border-line flex items-center justify-center shadow-lg shadow-black/20">
                {coverUrl ? (
                  <img
                    src={coverUrl}
                    alt={book.title ?? book.filename}
                    onError={() => { if (!pendingCoverPreview) setImgError(true) }}
                    className="w-full h-full object-cover"
                    draggable={false}
                  />
                ) : (
                  <BookOpen size={56} className="text-ink-faint" />
                )}
              </div>
            </div>

            {/* Details card, stretched to the cover's height on wider screens */}
            <div className="card min-w-0 p-5 flex flex-col gap-4 md:col-start-2 md:row-start-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-ink-muted uppercase tracking-wide">Title</label>
                  <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Unknown title" className="field" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-ink-muted uppercase tracking-wide">Author</label>
                  <input type="text" value={author} onChange={e => setAuthor(e.target.value)} placeholder="Unknown author" className="field" />
                </div>
              </div>

              <div className="grid grid-cols-[5.5rem_minmax(0,1fr)_5rem] gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-ink-muted uppercase tracking-wide">Year</label>
                  <input type="text" value={publishedDate} onChange={e => setPublishedDate(e.target.value)} placeholder="YYYY" className="field" />
                </div>
                <div className="flex flex-col gap-1 min-w-0">
                  <label className="text-xs font-medium text-ink-muted uppercase tracking-wide">Series</label>
                  <input type="text" value={series} onChange={e => setSeries(e.target.value)} placeholder="Series name" className="field" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-ink-muted uppercase tracking-wide">Order</label>
                  <input type="number" value={seriesOrder} onChange={e => setSeriesOrder(e.target.value)} placeholder="-" min={0} step={0.1} className="field" />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-ink-muted uppercase tracking-wide">Tags</label>
                <TagDropdown
                  bookId={bookId} allTags={allTags} bookTags={displayTags}
                  onTagAdded={handleTagAdded}
                  onTagRemoved={handleTagRemoved}
                />
              </div>

              {/* Cover and file actions */}
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setShowCoverDialog(true)} className="btn-outline justify-center whitespace-nowrap px-3 sm:px-4 flex-1 sm:flex-none">
                    <Image size={14} />
                    Change Cover
                  </button>
                  {book.file_format?.toLowerCase() === 'epub' && (
                    <button
                      type="button"
                      onClick={() => cleanupMutation.mutate()}
                      disabled={cleanupMutation.isPending}
                      title="Runs the cleanup steps chosen in Settings, using the saved details"
                      className="btn-outline justify-center whitespace-nowrap px-3 sm:px-4 flex-1 sm:flex-none"
                    >
                      {cleanupMutation.isPending ? <Spinner size={14} /> : <Sparkles size={14} />}
                      Clean Up EPUB
                    </button>
                  )}
                </div>
                {pendingCoverPreview && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-accent">New cover selected. Save to apply.</span>
                    <button type="button" onClick={clearPendingCover} className="text-ink-muted hover:text-ink underline">
                      Clear
                    </button>
                  </div>
                )}
              </div>

              {saveMutation.isError && (
                <div className="flex items-center gap-2 text-xs text-danger">
                  <AlertCircle size={12} />
                  Failed to save changes. Please try again.
                </div>
              )}

              {/* Pinned to the bottom so the card lines up with the cover */}
              <div className="mt-auto flex flex-col gap-4 pt-2">
                {book.progress?.percentage != null && (
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-3 text-xs text-ink-muted">
                      <span className="text-ink font-medium">{Math.round(book.progress.percentage * 100)}% read</span>
                      <span className="truncate">{formatProgressSource(book.progress.device, book.progress.timestamp)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-surface-raised overflow-hidden">
                      <div className="h-full bg-accent" style={{ width: `${book.progress.percentage * 100}%` }} />
                    </div>
                  </div>
                )}

                <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 border-t border-line pt-4 text-sm">
                  <div className="min-w-0">
                    <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide">Format</dt>
                    <dd className="mt-1 text-ink">{fileFormat || 'Unknown'}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide">Size</dt>
                    <dd className="mt-1 text-ink">{formatFileSize(book.file_size)}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide">Added</dt>
                    <dd className="mt-1 text-ink">{formatDate(book.date_added)}</dd>
                  </div>
                  <div className="col-span-2 sm:col-span-3 min-w-0">
                    <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide">File</dt>
                    <dd className="mt-1 font-mono text-xs text-ink-muted break-all">{book.filename}</dd>
                  </div>
                </dl>
              </div>
            </div>
          </fieldset>
        )}
      </div>

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
