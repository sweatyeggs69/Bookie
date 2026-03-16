import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Plus, Trash2, Edit2, Loader2, BookOpen, Layers } from 'lucide-react'
import * as api from '../api/client'
import { Shelf, Book } from '../types'
import { useStore } from '../store'
import BookCard from '../components/BookCard'
import BookListItem from '../components/BookListItem'
import BookDialog from '../components/BookDialog'
import { useToast } from '../App'

const SHELF_COLORS = [
  '#7c6af8', '#4a9af8', '#4ade80', '#f8a34a',
  '#e05252', '#f84a9a', '#4af8e0', '#f8e04a',
]

interface ShelfFormProps {
  initial?: Partial<Shelf>
  onSave: (data: { name: string; description: string; color: string }) => void
  onCancel: () => void
  saving?: boolean
}

function ShelfForm({ initial, onSave, onCancel, saving }: ShelfFormProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [color, setColor] = useState(initial?.color ?? SHELF_COLORS[0])

  return (
    <div className="card p-5 space-y-4">
      <h3 className="text-sm font-semibold text-ink">{initial ? 'Edit Shelf' : 'New Shelf'}</h3>
      <div>
        <label className="block text-xs text-ink-muted mb-1.5">Name</label>
        <input
          autoFocus
          className="field"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Shelf name"
          onKeyDown={e => e.key === 'Enter' && name.trim() && onSave({ name, description, color })}
        />
      </div>
      <div>
        <label className="block text-xs text-ink-muted mb-1.5">Description (optional)</label>
        <input
          className="field"
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="What's this shelf for?"
        />
      </div>
      <div>
        <label className="block text-xs text-ink-muted mb-1.5">Color</label>
        <div className="flex gap-2 flex-wrap">
          {SHELF_COLORS.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className="w-7 h-7 rounded-full border-2 transition-all"
              style={{
                backgroundColor: c,
                borderColor: color === c ? '#fff' : 'transparent',
                boxShadow: color === c ? `0 0 0 2px ${c}` : 'none',
              }}
              aria-label={c}
            />
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <button
          className="btn-primary"
          onClick={() => name.trim() && onSave({ name, description, color })}
          disabled={!name.trim() || saving}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Save
        </button>
        <button className="btn-outline" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

export default function ShelvesPage() {
  const { viewMode, gridSize, selectedBookId, setSelectedBookId } = useStore()
  const qc = useQueryClient()
  const { addToast } = useToast()

  const [selectedShelfId, setSelectedShelfId] = useState<number | null>(null)
  const [showNewForm, setShowNewForm] = useState(false)
  const [editingShelfId, setEditingShelfId] = useState<number | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

  // unused ref kept for future outside-click handling
  const _formRef = useRef<HTMLDivElement>(null)

  const { data: shelves = [], isLoading: shelvesLoading } = useQuery<Shelf[]>({
    queryKey: ['shelves'],
    queryFn: api.getShelves,
  })

  const { data: shelfBooks = [], isFetching: booksFetching } = useQuery<Book[]>({
    queryKey: ['shelfBooks', selectedShelfId],
    queryFn: () => api.getShelfBooks(selectedShelfId!),
    enabled: selectedShelfId !== null,
  })

  const createMutation = useMutation({
    mutationFn: api.createShelf,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['shelves'] }); setShowNewForm(false) },
    onError: (e: Error) => addToast('error', e.message),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof api.updateShelf>[1] }) =>
      api.updateShelf(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['shelves'] }); setEditingShelfId(null) },
    onError: (e: Error) => addToast('error', e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: api.deleteShelf,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shelves'] })
      if (selectedShelfId === confirmDeleteId) setSelectedShelfId(null)
      setConfirmDeleteId(null)
    },
    onError: (e: Error) => addToast('error', e.message),
  })

  const removeBookMutation = useMutation({
    mutationFn: ({ bookId }: { bookId: number }) =>
      api.removeBookFromShelf(selectedShelfId!, bookId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shelfBooks', selectedShelfId] }),
    onError: (e: Error) => addToast('error', e.message),
  })

  const selectedShelf = shelves.find(s => s.id === selectedShelfId)

  // ── Shelf detail view ───────────────────────────────────────────────────────
  if (selectedShelfId !== null && selectedShelf) {
    return (
      <div>
        {/* Header */}
        <div className="sticky top-14 z-30 bg-surface border-b border-line px-4 py-2.5 flex items-center gap-3">
          <button
            onClick={() => setSelectedShelfId(null)}
            className="w-8 h-8 flex items-center justify-center rounded text-ink-muted hover:text-ink hover:bg-surface-raised transition-colors"
          >
            <ArrowLeft size={16} />
          </button>
          <span
            className="w-3 h-3 rounded-full shrink-0"
            style={{ backgroundColor: selectedShelf.color }}
          />
          <h2 className="text-sm font-semibold text-ink">{selectedShelf.name}</h2>
          {selectedShelf.description && (
            <span className="text-xs text-ink-muted hidden sm:inline">— {selectedShelf.description}</span>
          )}
          <span className="ml-auto text-xs text-ink-faint">{selectedShelf.book_count} book{selectedShelf.book_count !== 1 ? 's' : ''}</span>
        </div>

        <div className="px-4 py-4">
          {booksFetching && shelfBooks.length === 0 && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-accent animate-spin" />
            </div>
          )}

          {!booksFetching && shelfBooks.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 gap-4 text-ink-muted">
              <BookOpen className="w-16 h-16 opacity-30" />
              <p className="text-base font-medium">No books on this shelf yet</p>
              <p className="text-sm">Open a book's detail dialog and use the Shelf button to add it here.</p>
            </div>
          )}

          {viewMode === 'grid' && shelfBooks.length > 0 && (
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${gridSize}px, 1fr))` }}
            >
              {shelfBooks.map(book => (
                <div key={book.id} className="relative group/shelf">
                  <BookCard book={book} onClick={() => setSelectedBookId(book.id)} />
                  <button
                    onClick={() => removeBookMutation.mutate({ bookId: book.id })}
                    className="absolute top-2 left-2 z-10 w-6 h-6 flex items-center justify-center rounded bg-black/60 text-white opacity-0 group-hover/shelf:opacity-100 hover:bg-danger transition-all"
                    title="Remove from shelf"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {viewMode === 'list' && shelfBooks.length > 0 && (
            <div className="space-y-1">
              {shelfBooks.map(book => (
                <BookListItem key={book.id} book={book} onClick={() => setSelectedBookId(book.id)} />
              ))}
            </div>
          )}
        </div>

        {selectedBookId !== null && (
          <BookDialog
            bookId={selectedBookId}
            onClose={() => setSelectedBookId(null)}
            onDelete={() => { setSelectedBookId(null); qc.invalidateQueries({ queryKey: ['shelfBooks', selectedShelfId] }) }}
          />
        )}
      </div>
    )
  }

  // ── Shelves overview ────────────────────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-ink">Shelves</h1>
        {!showNewForm && (
          <button className="btn-primary" onClick={() => setShowNewForm(true)}>
            <Plus className="w-4 h-4" />
            New Shelf
          </button>
        )}
      </div>

      {showNewForm && (
        <div className="mb-6" ref={_formRef}>
          <ShelfForm
            onSave={data => createMutation.mutate(data)}
            onCancel={() => setShowNewForm(false)}
            saving={createMutation.isPending}
          />
        </div>
      )}

      {shelvesLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-accent animate-spin" />
        </div>
      )}

      {!shelvesLoading && shelves.length === 0 && !showNewForm && (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-ink-muted">
          <Layers className="w-16 h-16 opacity-30" />
          <p className="text-base font-medium">No shelves yet</p>
          <p className="text-sm">Create shelves to organize your library into collections.</p>
          <button className="btn-primary mt-2" onClick={() => setShowNewForm(true)}>
            <Plus className="w-4 h-4" />
            Create your first shelf
          </button>
        </div>
      )}

      {shelves.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {shelves.map(shelf => {
            if (editingShelfId === shelf.id) {
              return (
                <div key={shelf.id}>
                  <ShelfForm
                    initial={shelf}
                    onSave={data => updateMutation.mutate({ id: shelf.id, data })}
                    onCancel={() => setEditingShelfId(null)}
                    saving={updateMutation.isPending}
                  />
                </div>
              )
            }

            return (
              <div
                key={shelf.id}
                className="card relative group cursor-pointer hover:border-line-strong transition-colors"
                onClick={() => setSelectedShelfId(shelf.id)}
              >
                {/* Color strip */}
                <div className="h-2 rounded-t-xl" style={{ backgroundColor: shelf.color }} />

                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="text-sm font-semibold text-ink truncate">{shelf.name}</h3>
                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={e => { e.stopPropagation(); setEditingShelfId(shelf.id) }}
                        className="w-6 h-6 flex items-center justify-center rounded text-ink-muted hover:text-ink hover:bg-surface-raised transition-colors"
                        title="Edit shelf"
                      >
                        <Edit2 size={12} />
                      </button>
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          if (confirmDeleteId === shelf.id) {
                            deleteMutation.mutate(shelf.id)
                          } else {
                            setConfirmDeleteId(shelf.id)
                            setTimeout(() => setConfirmDeleteId(null), 3000)
                          }
                        }}
                        className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${
                          confirmDeleteId === shelf.id
                            ? 'text-white bg-danger'
                            : 'text-ink-muted hover:text-danger hover:bg-danger/10'
                        }`}
                        title={confirmDeleteId === shelf.id ? 'Click again to confirm' : 'Delete shelf'}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                  {shelf.description && (
                    <p className="text-xs text-ink-muted truncate mb-2">{shelf.description}</p>
                  )}
                  <p className="text-xs text-ink-faint">
                    {shelf.book_count} book{shelf.book_count !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
