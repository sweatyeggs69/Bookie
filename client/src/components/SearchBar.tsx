import { useEffect, useRef, useState } from 'react'
import { Search, X, BookOpen } from 'lucide-react'
import { useStore } from '../store'
import * as api from '../api/client'
import { Book } from '../types'

export default function SearchBar() {
  const { filters, setFilters } = useStore()

  const [localQ, setLocalQ] = useState(filters.q)
  const [dropdownResults, setDropdownResults] = useState<Book[]>([])
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [dropdownLoading, setDropdownLoading] = useState(false)

  const mainDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dropdownDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Sync localQ if store filter cleared externally
  useEffect(() => {
    setLocalQ(filters.q)
  }, [filters.q])

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleChange(value: string) {
    setLocalQ(value)

    if (mainDebounce.current) clearTimeout(mainDebounce.current)
    mainDebounce.current = setTimeout(() => setFilters({ q: value }), 350)

    if (dropdownDebounce.current) clearTimeout(dropdownDebounce.current)
    if (value.trim().length >= 2) {
      dropdownDebounce.current = setTimeout(async () => {
        setDropdownLoading(true)
        try {
          const res = await api.getBooks({ q: value.trim(), per_page: 5 })
          setDropdownResults(res.books)
          setDropdownOpen(true)
        } catch {
          setDropdownResults([])
        } finally {
          setDropdownLoading(false)
        }
      }, 200)
    } else {
      setDropdownResults([])
      setDropdownOpen(false)
    }
  }

  function clear() {
    setLocalQ('')
    setFilters({ q: '' })
    setDropdownResults([])
    setDropdownOpen(false)
    inputRef.current?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { setDropdownOpen(false); setFilters({ q: localQ.trim() }) }
    if (e.key === 'Escape') setDropdownOpen(false)
  }

  function handleDropdownItemClick(book: Book) {
    setDropdownOpen(false)
    setLocalQ(book.title ?? book.filename)
    setFilters({ q: book.title ?? book.filename })
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
      <input
        ref={inputRef}
        type="text"
        value={localQ}
        onChange={e => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => dropdownResults.length > 0 && setDropdownOpen(true)}
        placeholder="Search books, authors…"
        className="w-full bg-surface-raised border border-line rounded pl-9 pr-9 py-2 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
        autoComplete="off"
        spellCheck={false}
      />
      {(localQ || dropdownLoading) && (
        <button
          type="button"
          onClick={clear}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink transition-colors"
          aria-label="Clear search"
          tabIndex={-1}
        >
          <X size={14} />
        </button>
      )}

      {dropdownOpen && dropdownResults.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-lg border border-line bg-surface-raised shadow-xl shadow-black/40 overflow-hidden">
          {dropdownResults.map(book => (
            <button
              key={book.id}
              type="button"
              onMouseDown={e => { e.preventDefault(); handleDropdownItemClick(book) }}
              className="flex items-center gap-3 w-full px-3 py-2 text-left hover:bg-surface-high transition-colors"
            >
              <div className="shrink-0 w-7 h-10 rounded overflow-hidden bg-surface-high border border-line flex items-center justify-center">
                {book.cover_filename ? (
                  <img src={`/api/books/${book.id}/cover`} alt="" className="w-full h-full object-cover" loading="lazy" draggable={false} />
                ) : (
                  <BookOpen size={12} className="text-ink-faint" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-ink text-sm truncate">{book.title ?? book.filename}</p>
                {book.author && <p className="text-ink-muted text-xs truncate">{book.author}</p>}
              </div>
              {book.file_format && (
                <span className="shrink-0 text-[10px] font-semibold uppercase text-ink-faint">
                  {book.file_format.toUpperCase()}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
