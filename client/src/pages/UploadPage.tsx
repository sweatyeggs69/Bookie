import { useState, useRef, useCallback } from 'react'
import { Upload, X, CheckCircle, AlertCircle, FileText, ArrowLeft } from 'lucide-react'
import { useStore } from '../store'
import * as api from '../api/client'

interface FileItem {
  id: string
  file: File
  status: 'pending' | 'uploading' | 'done' | 'error'
  progress: number
  error?: string
}

const ALLOWED = new Set(['epub', 'pdf', 'mobi', 'azw', 'azw3', 'fb2', 'djvu', 'cbz', 'cbr', 'txt'])

function ext(name: string) {
  return name.split('.').pop()?.toLowerCase() ?? ''
}

export default function UploadPage() {
  const { setView } = useStore()
  const [items, setItems] = useState<FileItem[]>([])
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function addFiles(files: File[]) {
    const valid = files.filter(f => ALLOWED.has(ext(f.name)))
    if (!valid.length) return
    setItems(prev => [
      ...prev,
      ...valid.map(f => ({
        id: Math.random().toString(36).slice(2),
        file: f,
        status: 'pending' as const,
        progress: 0,
      })),
    ])
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    addFiles(Array.from(e.dataTransfer.files))
  }, [])

  async function uploadAll() {
    const pending = items.filter(i => i.status === 'pending' || i.status === 'error')
    for (const item of pending) {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'uploading', progress: 0, error: undefined } : i))
      try {
        await api.uploadFile(item.file, progress => {
          setItems(prev => prev.map(i => i.id === item.id ? { ...i, progress } : i))
        })
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'done', progress: 100 } : i))
      } catch (err) {
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'error', error: (err as Error).message } : i))
      }
    }
  }

  const pendingCount = items.filter(i => i.status === 'pending' || i.status === 'error').length
  const doneCount = items.filter(i => i.status === 'done').length

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => setView('library')}
          className="btn-ghost p-2 -ml-2"
          title="Back to library"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="text-lg font-semibold text-ink">Upload Books</h1>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-3 py-16 cursor-pointer transition-colors select-none
          ${dragging ? 'border-accent bg-accent/5' : 'border-line hover:border-line-strong hover:bg-surface-card'}`}
      >
        <Upload className={`w-10 h-10 ${dragging ? 'text-accent' : 'text-ink-muted'}`} />
        <div className="text-center">
          <p className="text-sm font-medium text-ink">Drop files here or click to browse</p>
          <p className="text-xs text-ink-muted mt-1">EPUB, PDF, MOBI, AZW3, FB2, DJVU, CBZ, CBR, TXT · max 35 MB</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={[...ALLOWED].map(e => `.${e}`).join(',')}
          className="hidden"
          onChange={e => addFiles(Array.from(e.target.files ?? []))}
          onClick={e => e.stopPropagation()}
        />
      </div>

      {/* Queue */}
      {items.length > 0 && (
        <div className="mt-4 space-y-2">
          {items.map(item => (
            <div key={item.id} className="card flex items-center gap-3 px-4 py-3">
              <FileText className="w-4 h-4 text-ink-muted shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-ink truncate">{item.file.name}</p>
                <p className="text-xs text-ink-muted">{(item.file.size / 1024 / 1024).toFixed(1)} MB</p>
                {item.status === 'uploading' && (
                  <div className="mt-1.5 h-1 bg-surface-raised rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent rounded-full transition-all duration-200"
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                )}
                {item.status === 'error' && (
                  <p className="text-xs text-danger mt-0.5">{item.error}</p>
                )}
              </div>
              {item.status === 'done' && <CheckCircle className="w-4 h-4 text-success shrink-0" />}
              {item.status === 'error' && <AlertCircle className="w-4 h-4 text-danger shrink-0" />}
              {(item.status === 'pending' || item.status === 'error') && (
                <button
                  onClick={() => setItems(prev => prev.filter(i => i.id !== item.id))}
                  className="text-ink-muted hover:text-danger transition-colors shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      {items.length > 0 && (
        <div className="flex items-center justify-between mt-4">
          <button
            onClick={() => setItems([])}
            className="btn-ghost text-sm"
          >
            Clear all
          </button>
          <div className="flex items-center gap-3">
            {doneCount > 0 && (
              <span className="text-sm text-success">{doneCount} uploaded</span>
            )}
            <button
              className="btn-primary"
              onClick={uploadAll}
              disabled={pendingCount === 0 || items.some(i => i.status === 'uploading')}
            >
              <Upload className="w-4 h-4" />
              Upload {pendingCount > 0 ? `${pendingCount} file${pendingCount > 1 ? 's' : ''}` : ''}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
