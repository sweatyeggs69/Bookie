import type {
  Book,
  BooksResponse,
  Filters,
  MetaResult,
  Settings,
  Tag,
  User,
  AuthStatus,
  UploadProgressCallback,
} from '../types'

// ─── Base fetch wrapper ───────────────────────────────────────────────────────

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  })

  if (response.status === 401) {
    // Force a full page reload so the server can redirect to the login page
    window.location.reload()
    // Return a promise that never resolves so callers don't proceed with stale state
    return new Promise<never>(() => {})
  }

  if (!response.ok) {
    let message = `HTTP ${response.status}`
    try {
      const body = await response.json()
      if (typeof body?.error === 'string') message = body.error
      else if (typeof body?.message === 'string') message = body.message
    } catch {
      // Non-JSON error body — keep the default message
    }
    throw new Error(message)
  }

  // 204 No Content — return undefined cast to T
  if (response.status === 204) {
    return undefined as unknown as T
  }

  const text = await response.text()
  if (!text) return undefined as unknown as T
  return JSON.parse(text) as T
}

// ─── Books ────────────────────────────────────────────────────────────────────

export type GetBooksParams = Partial<Filters> & { page?: number; per_page?: number }

export function getBooks(params: GetBooksParams = {}): Promise<BooksResponse> {
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      qs.set(key, String(value))
    }
  }
  const query = qs.toString()
  return api<BooksResponse>(`/api/books${query ? `?${query}` : ''}`)
}

export function getBook(id: number): Promise<Book> {
  return api<Book>(`/api/books/${id}`)
}

export function updateBook(id: number, data: Partial<Book>): Promise<Book> {
  return api<Book>(`/api/books/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export function deleteBook(id: number): Promise<void> {
  return api<void>(`/api/books/${id}`, { method: 'DELETE' })
}

// ─── Tags ─────────────────────────────────────────────────────────────────────

export function getTags(): Promise<Tag[]> {
  return api<Tag[]>('/api/tags')
}

export function getBookTags(bookId: number): Promise<Tag[]> {
  return api<Tag[]>(`/api/books/${bookId}/tags`)
}

export function addBookTag(bookId: number, name: string): Promise<Tag> {
  return api<Tag>(`/api/books/${bookId}/tags`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

export function removeBookTag(bookId: number, tagId: number): Promise<void> {
  return api<void>(`/api/books/${bookId}/tags/${tagId}`, { method: 'DELETE' })
}

// ─── Cover ────────────────────────────────────────────────────────────────────

export function getCoverUrl(bookId: number): string {
  return `/api/books/${bookId}/cover`
}

// ─── Library scan ─────────────────────────────────────────────────────────────

export function scanLibrary(): Promise<{ added: number; removed: number; updated: number }> {
  return api('/api/books/scan', { method: 'POST' })
}

// ─── Metadata search ──────────────────────────────────────────────────────────

export function searchMeta(query: string): Promise<MetaResult[]> {
  const qs = new URLSearchParams({ q: query })
  return api<MetaResult[]>(`/api/metadata/search?${qs}`)
}

export function applyMeta(bookId: number, meta: MetaResult): Promise<Book> {
  return api<Book>(`/api/books/${bookId}/apply-metadata`, {
    method: 'POST',
    body: JSON.stringify(meta),
  })
}

// ─── Upload ───────────────────────────────────────────────────────────────────

export function uploadFile(
  file: File,
  onProgress?: UploadProgressCallback,
): Promise<Book> {
  return new Promise<Book>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const formData = new FormData()
    formData.append('file', file)

    xhr.open('POST', '/api/books/upload')
    xhr.withCredentials = true

    if (onProgress) {
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          onProgress(Math.round((event.loaded / event.total) * 100))
        }
      })
    }

    xhr.addEventListener('load', () => {
      if (xhr.status === 401) {
        window.location.reload()
        return
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as Book)
        } catch {
          reject(new Error('Invalid JSON in upload response'))
        }
      } else {
        let message = `Upload failed (HTTP ${xhr.status})`
        try {
          const body = JSON.parse(xhr.responseText)
          if (body?.error) message = body.error
          else if (body?.message) message = body.message
        } catch {
          // keep default message
        }
        reject(new Error(message))
      }
    })

    xhr.addEventListener('error', () => {
      reject(new Error('Network error during upload'))
    })

    xhr.addEventListener('abort', () => {
      reject(new Error('Upload aborted'))
    })

    xhr.send(formData)
  })
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export function getSettings(): Promise<Settings> {
  return api<Settings>('/api/settings')
}

export function saveSettings(data: Partial<Settings>): Promise<Settings> {
  return api<Settings>('/api/settings', {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export function login(username: string, password: string): Promise<User> {
  return api<User>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export function logout(): Promise<void> {
  return api<void>('/api/auth/logout', { method: 'POST' })
}

export function getAuthStatus(): Promise<AuthStatus> {
  return api<AuthStatus>('/api/auth/status')
}

// ─── User management ──────────────────────────────────────────────────────────

export function getUsers(): Promise<User[]> {
  return api<User[]>('/api/admin/users')
}

export function createUser(data: {
  username: string
  password: string
  role: string
}): Promise<User> {
  return api<User>('/api/admin/users', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function deleteUser(id: number): Promise<void> {
  return api<void>(`/api/admin/users/${id}`, { method: 'DELETE' })
}

export function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  return api<void>('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
    }),
  })
}

// ─── Tags admin (same as regular tags API) ────────────────────────────────────

export function adminGetTags(): Promise<Tag[]> {
  return getTags()
}

export function adminCreateTag(name: string): Promise<Tag> {
  return api<Tag>('/api/tags', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

export function adminDeleteTag(id: number): Promise<void> {
  return api<void>(`/api/tags/${id}`, { method: 'DELETE' })
}

// ─── Default export (namespace object) ───────────────────────────────────────

export default {
  // Auth
  getAuthStatus,
  login,
  logout,
  changePassword,
  // Books
  getBooks,
  getBook,
  updateBook,
  deleteBook,
  // Tags
  getTags,
  getBookTags,
  addBookTag,
  removeBookTag,
  // Cover
  getCoverUrl,
  // Library
  scanLibrary,
  // Metadata
  searchMeta,
  applyMeta,
  // Upload
  uploadFile,
  // Settings
  getSettings,
  saveSettings,
  // User management
  getUsers,
  createUser,
  deleteUser,
  // Tags admin
  adminGetTags,
  adminCreateTag,
  adminDeleteTag,
}
