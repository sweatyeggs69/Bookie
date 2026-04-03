import { useState, useRef, useEffect } from 'react'
import { Search, Upload, X, Check } from 'lucide-react'
import Dialog from './Dialog'
import Spinner from './Spinner'

interface Props {
  bookTitle?: string
  bookAuthor?: string
  onClose: () => void
  onSelected: (cover: { url: string } | { file: File }) => void
}

interface CoverResult {
  title: string
  cover_url: string
  source: string
}

const SOURCE_LABELS: Record<string, string> = {
  open_library: 'OpenLib',
  goodreads: 'Goodreads',
  itunes: 'Apple Books',
}

export default function CoverDialog({ bookTitle, bookAuthor, onClose, onSelected }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [searchQuery, setSearchQuery] = useState([bookTitle, bookAuthor].filter(Boolean).join(' '))
  const [coverResults, setCoverResults] = useState<CoverResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null)
  const [manualUrl, setManualUrl] = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewFile, setPreviewFile] = useState<File | null>(null)
  const [previewMode, setPreviewMode] = useState<'search' | 'url' | 'file' | null>(null)

  // Revoke any object URLs on cleanup
  const objectUrlRef = useRef<string | null>(null)
  useEffect(() => {
    return () => { if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current) }
  }, [])

  // Auto-search on mount when there's a query
  useEffect(() => {
    if (searchQuery.trim()) searchCovers()
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

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
      console.error('Cover search failed')
    } finally {
      setSearching(false)
    }
  }

  function selectSearchResult(url: string) {
    setSelectedUrl(url); setPreviewUrl(url); setPreviewFile(null); setManualUrl(''); setPreviewMode('search')
  }

  function applyManualUrl() {
    const url = manualUrl.trim()
    if (!url) return
    setSelectedUrl(url); setPreviewUrl(url); setPreviewFile(null); setPreviewMode('url')
  }

  function handleUploadButtonClick() {
    fileInputRef.current?.click()
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    const objUrl = URL.createObjectURL(file)
    objectUrlRef.current = objUrl
    setPreviewFile(file); setPreviewUrl(objUrl); setSelectedUrl(null); setManualUrl(''); setPreviewMode('file')
    e.target.value = ''
  }

  function clearPreview() {
    if (objectUrlRef.current) { URL.revokeObjectURL(objectUrlRef.current); objectUrlRef.current = null }
    setPreviewUrl(null); setPreviewFile(null); setSelectedUrl(null); setPreviewMode(null)
  }

  function handleSelect() {
    if (previewFile) {
      onSelected({ file: previewFile })
    } else {
      const url = selectedUrl || manualUrl.trim()
      if (url) onSelected({ url })
    }
    onClose()
  }

  const canSelect = previewMode !== null && (previewFile || selectedUrl || manualUrl.trim())

  const footer = (
    <div className="flex items-center justify-between gap-3">
      <button type="button" onClick={onClose} className="px-3 py-2 rounded text-sm font-medium text-ink border border-line hover:bg-surface-raised transition-colors">
        Cancel
      </button>
      <button
        type="button"
        onClick={handleSelect}
        disabled={!canSelect}
        className="flex items-center gap-1.5 px-4 py-2 rounded text-sm font-medium bg-accent hover:bg-accent-hover text-white transition-colors disabled:opacity-50"
      >
        <Check size={14} />
        Select
      </button>
    </div>
  )

  return (
    <Dialog
      open
      onClose={onClose}
      title="Change Cover"
      footer={footer}
      wide
      panelClassName="h-[75dvh] sm:h-auto"
    >
      <div className="p-4 h-full min-h-0 flex flex-col gap-3">
        {/* Search bar */}
        <div className="flex gap-2">
          <input
            className="field flex-1"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && searchCovers()}
            placeholder="Search for covers…"
          />
          <button
            type="button"
            onClick={searchCovers}
            disabled={searching || !searchQuery.trim()}
            className="flex items-center gap-1.5 px-3 py-2 rounded text-sm font-medium border border-line hover:bg-surface-raised transition-colors disabled:opacity-50 shrink-0"
          >
            {searching ? <Spinner size={14} /> : <Search size={14} />}
            Search
          </button>
        </div>

        {/* Results grid */}
        <div className="flex-1 min-h-0">
          {searching && (
            <div className="flex h-full min-h-24 items-center justify-center"><Spinner size={24} /></div>
          )}
          {!searching && coverResults.length > 0 && (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(92px,1fr))] md:grid-cols-4 lg:grid-cols-5 gap-2 overflow-y-auto pr-1 h-full min-h-0 sm:max-h-72 content-start">
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
                  <span className="absolute bottom-0 left-0 right-0 text-[8px] bg-black/60 text-white px-0.5 py-0.5 truncate text-center leading-tight">
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
          {!searching && coverResults.length === 0 && searchQuery && (
            <p className="text-xs text-ink-muted text-center py-2">No covers found — try a different search</p>
          )}
        </div>

        {/* Selected preview strip */}
        {previewUrl && (
          <div className="flex items-center gap-3 px-3 py-2 bg-surface-raised rounded-lg">
            <img src={previewUrl} alt="Selected" className="h-16 w-11 object-cover rounded shrink-0 border border-line" />
            <p className="text-xs text-ink-muted flex-1 truncate">
              {previewMode === 'file' ? previewFile?.name : 'Cover selected — click Select to preview'}
            </p>
            <button type="button" onClick={clearPreview} className="text-ink-muted hover:text-ink shrink-0">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Bottom row: URL input + file upload */}
        <div className="flex gap-2 pt-3 border-t border-line">
          <input ref={fileInputRef} type="file" accept="image/*" className="sr-only" onChange={handleFileSelect} />
          <div className="flex-1 min-w-0">
            <input
              className="field w-full"
              value={manualUrl}
              onChange={e => setManualUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && applyManualUrl()}
              placeholder="Paste image URL and press Enter..."
              type="url"
            />
          </div>
          <button
            type="button"
            onClick={handleUploadButtonClick}
            className="flex items-center gap-1.5 px-3 py-2 rounded text-sm font-medium text-ink border border-line hover:bg-surface-raised transition-colors shrink-0 self-start"
          >
            <Upload size={14} />
            Upload
          </button>
        </div>
      </div>
    </Dialog>
  )
}
