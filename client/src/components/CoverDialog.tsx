import { useState, useRef } from 'react'
import { useQueryClient, useMutation } from '@tanstack/react-query'
import { Search, Upload, Link, X, Check } from 'lucide-react'
import * as api from '../api/client'
import type { Book } from '../types'
import Dialog from './Dialog'
import Spinner from './Spinner'
import { useToast } from '../App'

interface Props {
  bookId: number
  bookTitle?: string
  bookAuthor?: string
  fileFormat?: string
  onClose: () => void
}

interface CoverResult {
  title: string
  cover_url: string
  source: string
}

const SOURCE_LABELS: Record<string, string> = {
  google_books: 'Google',
  open_library: 'OpenLib',
  goodreads: 'Goodreads',
  itunes: 'iTunes',
}

export default function CoverDialog({ bookId, bookTitle, bookAuthor, fileFormat, onClose }: Props) {
  const qc = useQueryClient()
  const { addToast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [searchQuery, setSearchQuery] = useState([bookTitle, bookAuthor].filter(Boolean).join(' '))
  const [coverResults, setCoverResults] = useState<CoverResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null)
  const [manualUrl, setManualUrl] = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewFile, setPreviewFile] = useState<File | null>(null)
  const [previewMode, setPreviewMode] = useState<'search' | 'url' | 'file' | null>(null)

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (previewFile) {
        const formData = new FormData()
        formData.append('cover', previewFile)
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
      } else {
        const url = selectedUrl || manualUrl.trim()
        if (!url) throw new Error('No cover selected')
        return api.setCoverFromUrl(bookId, url)
      }
    },
    onSuccess: async (book) => {
      // Try to embed into EPUB
      if (fileFormat?.toLowerCase() === 'epub') {
        try {
          await api.embedCover(bookId)
          addToast('success', 'Cover saved and embedded in EPUB')
        } catch {
          addToast('success', 'Cover saved (embed failed)')
        }
      } else {
        addToast('success', 'Cover saved')
      }
      qc.setQueryData(['book', bookId], book)
      qc.invalidateQueries({ queryKey: ['books'] })
      onClose()
    },
    onError: (e: Error) => addToast('error', e.message),
  })

  async function searchCovers() {
    const q = searchQuery.trim()
    if (!q) return
    setSearching(true)
    setCoverResults([])
    try {
      const results = await fetch(`/api/metadata/search?q=${encodeURIComponent(q)}`, { credentials: 'include' })
        .then(r => r.json()) as CoverResult[]
      setCoverResults(Array.isArray(results) ? results.filter(r => r.cover_url) : [])
    } catch {
      addToast('error', 'Search failed')
    } finally {
      setSearching(false)
    }
  }

  function selectSearchResult(url: string) {
    setSelectedUrl(url)
    setPreviewUrl(url)
    setPreviewFile(null)
    setManualUrl('')
    setPreviewMode('search')
  }

  function applyManualUrl() {
    const url = manualUrl.trim()
    if (!url) return
    setSelectedUrl(url)
    setPreviewUrl(url)
    setPreviewFile(null)
    setPreviewMode('url')
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPreviewFile(file)
    setPreviewUrl(URL.createObjectURL(file))
    setSelectedUrl(null)
    setManualUrl('')
    setPreviewMode('file')
    e.target.value = ''
  }

  const canSave = previewMode !== null && (previewFile || selectedUrl || manualUrl.trim())

  const footer = (
    <div className="flex items-center justify-between gap-3">
      <button
        type="button"
        onClick={onClose}
        className="px-3 py-2 rounded text-sm font-medium text-ink border border-line hover:bg-surface-raised transition-colors"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={() => uploadMutation.mutate()}
        disabled={!canSave || uploadMutation.isPending}
        className="flex items-center gap-1.5 px-4 py-2 rounded text-sm font-medium bg-accent hover:bg-accent-hover text-white transition-colors disabled:opacity-50"
      >
        {uploadMutation.isPending ? <Spinner size={14} className="text-white" /> : <Check size={14} />}
        Set Cover
      </button>
    </div>
  )

  return (
    <Dialog open onClose={onClose} title="Change Cover" footer={footer} wide>
      <div className="p-5 space-y-5">
        {/* Preview */}
        {previewUrl && (
          <div className="flex flex-col items-center gap-2">
            <div className="relative">
              <img
                src={previewUrl}
                alt="Cover preview"
                className="max-h-48 max-w-[120px] rounded-lg object-contain border border-line shadow-sm"
              />
              <button
                type="button"
                onClick={() => { setPreviewUrl(null); setPreviewFile(null); setSelectedUrl(null); setPreviewMode(null) }}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-surface-raised border border-line flex items-center justify-center text-ink-muted hover:text-ink"
              >
                <X size={10} />
              </button>
            </div>
            <p className="text-xs text-ink-muted">
              {previewMode === 'file' ? previewFile?.name : 'Selected cover'}
            </p>
          </div>
        )}

        {/* Search */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-ink-muted uppercase tracking-wide">Search Online</p>
          <div className="flex gap-2">
            <input
              className="field flex-1"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && searchCovers()}
              placeholder="Title and/or author…"
            />
            <button
              type="button"
              onClick={searchCovers}
              disabled={searching || !searchQuery.trim()}
              className="flex items-center gap-1.5 px-3 py-2 rounded text-sm font-medium border border-line hover:bg-surface-raised transition-colors disabled:opacity-50"
            >
              {searching ? <Spinner size={14} /> : <Search size={14} />}
              Search
            </button>
          </div>
          {coverResults.length > 0 && (
            <div className="grid grid-cols-4 gap-2 max-h-52 overflow-y-auto mt-2 pr-1">
              {coverResults.map((r, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => selectSearchResult(r.cover_url)}
                  className={[
                    'relative rounded-lg overflow-hidden border-2 transition-all',
                    selectedUrl === r.cover_url ? 'border-accent' : 'border-transparent hover:border-line',
                  ].join(' ')}
                  title={`${r.title} (${SOURCE_LABELS[r.source] ?? r.source})`}
                >
                  <img
                    src={r.cover_url}
                    alt={r.title}
                    loading="lazy"
                    className="w-full aspect-[2/3] object-cover bg-surface-raised"
                    onError={e => (e.currentTarget.closest('button')!.style.display = 'none')}
                  />
                  <span className="absolute bottom-0 left-0 right-0 text-[9px] bg-black/60 text-white px-1 py-0.5 truncate">
                    {SOURCE_LABELS[r.source] ?? r.source}
                  </span>
                  {selectedUrl === r.cover_url && (
                    <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-accent flex items-center justify-center">
                      <Check size={10} className="text-white" />
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
          {coverResults.length === 0 && !searching && searchQuery && (
            <p className="text-xs text-ink-muted">No results yet — click Search</p>
          )}
        </div>

        <div className="border-t border-line" />

        {/* Upload from file */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-ink-muted uppercase tracking-wide">Upload from File</p>
          <input ref={fileInputRef} type="file" accept="image/*" className="sr-only" onChange={handleFileSelect} />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-3 py-2 rounded text-sm text-ink border border-line hover:bg-surface-raised transition-colors"
          >
            <Upload size={14} />
            Choose image file…
          </button>
        </div>

        <div className="border-t border-line" />

        {/* Paste URL */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-ink-muted uppercase tracking-wide">Paste Image URL</p>
          <div className="flex gap-2">
            <input
              className="field flex-1"
              value={manualUrl}
              onChange={e => setManualUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && applyManualUrl()}
              placeholder="https://…"
              type="url"
            />
            <button
              type="button"
              onClick={applyManualUrl}
              disabled={!manualUrl.trim()}
              className="flex items-center gap-1.5 px-3 py-2 rounded text-sm font-medium border border-line hover:bg-surface-raised transition-colors disabled:opacity-50"
            >
              <Link size={14} />
              Preview
            </button>
          </div>
        </div>
      </div>
    </Dialog>
  )
}
