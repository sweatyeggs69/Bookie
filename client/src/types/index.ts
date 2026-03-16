// ─── Book ────────────────────────────────────────────────────────────────────

export interface Book {
  id: number
  filename: string
  file_format: string
  file_size: number

  // Bibliographic metadata
  title: string | null
  author: string | null
  isbn: string | null
  isbn13: string | null
  publisher: string | null
  published_date: string | null
  language: string | null
  page_count: number | null

  // User metadata
  rating: number | null

  // External IDs
  google_books_id: string | null
  goodreads_id: string | null

  // Cover
  cover_filename: string | null

  // Series
  series: string | null
  series_order: number | null

  // Timestamps
  date_added: string
  date_modified: string

  // Tags
  tags: string[]
}

// ─── Tag ─────────────────────────────────────────────────────────────────────

export interface Tag {
  id: number
  name: string
  book_count: number
}

// ─── User ────────────────────────────────────────────────────────────────────

export interface User {
  id: number
  username: string
  role: 'admin' | 'user'
}

// ─── Paginated books response ────────────────────────────────────────────────

export interface BooksResponse {
  books: Book[]
  total: number
  pages: number
  page: number
}

// ─── Filters ─────────────────────────────────────────────────────────────────

export type SortField =
  | 'title'
  | 'author'
  | 'date_added'
  | 'date_modified'
  | 'published_date'
  | 'rating'
  | 'file_size'
  | 'page_count'

export interface Filters {
  q: string
  format: string
  tag: string
  sort: SortField
  order: 'asc' | 'desc'
}

// ─── Settings ────────────────────────────────────────────────────────────────

export interface Settings {
  library_name: string
  theme: string
  library_path: string
  cover_path: string
  books_per_page: number
  allow_registration: boolean
  scan_on_startup: boolean
  default_sort: SortField
  default_order: 'asc' | 'desc'
  [key: string]: unknown
}

// ─── Metadata search result ───────────────────────────────────────────────────

export interface MetaResult {
  title: string | null
  author: string | null
  published_date: string | null
  isbn: string | null
  isbn13: string | null
  publisher: string | null
  description: string | null
  cover_url: string | null
  google_books_id: string | null
  source: string
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface AuthStatus {
  authenticated: boolean
  username: string | null
  first_run: boolean
}

// ─── Upload progress callback ─────────────────────────────────────────────────

export type UploadProgressCallback = (percent: number) => void
