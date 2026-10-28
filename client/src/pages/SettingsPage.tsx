import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, Plus, Trash2, Loader2, AlertCircle, Key, Mail, RefreshCw, Download, Rss } from 'lucide-react'
import { useToast } from '../contexts/toast'
import * as api from '../api/client'
import type { EmailAddress, Stats } from '../types'

type Tab = 'library' | 'metadata' | 'cleanup' | 'email' | 'account' | 'logs'
const VALID_TABS: Tab[] = ['library', 'metadata', 'cleanup', 'email', 'account', 'logs']
const DEFAULT_TAB: Tab = 'library'

function getHashTab(): Tab {
  const hash = window.location.hash.replace('#', '') as Tab
  return VALID_TABS.includes(hash) ? hash : DEFAULT_TAB
}

export default function SettingsPage() {
  const [tab, setTabState] = useState<Tab>(getHashTab)

  useEffect(() => {
    // Set hash on mount if missing or invalid
    const hash = window.location.hash.replace('#', '')
    if (!VALID_TABS.includes(hash as Tab)) {
      window.location.replace(`${window.location.pathname}${window.location.search}#${DEFAULT_TAB}`)
    }
    const onHashChange = () => setTabState(getHashTab())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const setTab = (t: Tab) => {
    window.location.hash = t
  }

  const tabs: { id: Tab; label: string; description: string }[] = [
    { id: 'library',  label: 'Library',      description: 'Tags, file organization and library statistics' },
    { id: 'metadata', label: 'Metadata',     description: 'Metadata sources and how book details are fetched' },
    { id: 'cleanup',  label: 'EPUB Cleanup', description: 'Tidy EPUB files on upload or across the library' },
    { id: 'email',    label: 'Email / SMTP', description: 'Outgoing mail server used to send books' },
    { id: 'account',  label: 'Account',      description: 'Profile, send-to addresses, OPDS, KOReader sync and password' },
    { id: 'logs',     label: 'Logs',         description: 'Application logs and log level' },
  ]
  const current = tabs.find(t => t.id === tab) ?? tabs[0]

  return (
    <div className="max-w-4xl px-4 py-6 md:px-8 md:py-8">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-ink">{current.label} Settings</h1>
        <p className="mt-2 text-base text-ink-muted">{current.description}</p>
      </div>

      {/* Tab bar — dropdown on mobile, underline tabs on desktop */}
      <div className="mb-6">
        {/* Mobile: select */}
        <select
          className="sm:hidden field"
          value={tab}
          onChange={e => setTab(e.target.value as Tab)}
        >
          {tabs.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>

        {/* Desktop: underline tabs */}
        <nav className="hidden sm:flex gap-2 border-b border-line overflow-x-auto no-scrollbar" aria-label="Settings sections">
          {tabs.map(t => (
            <a
              key={t.id}
              href={`#${t.id}`}
              aria-current={tab === t.id ? 'page' : undefined}
              className={`-mb-px border-b-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors
                ${tab === t.id
                  ? 'border-accent text-accent'
                  : 'border-transparent text-ink-muted hover:border-line-strong hover:text-ink'}`}
            >
              {t.label}
            </a>
          ))}
        </nav>
      </div>

      {tab === 'library'  && <LibraryTab />}
      {tab === 'metadata' && <MetadataTab />}
      {tab === 'cleanup'  && <CleanupTab />}
      {tab === 'email'    && <EmailTab />}
      {tab === 'account'  && <AccountTab />}
      {tab === 'logs'     && <LogsTab />}
    </div>
  )
}

// ── Email / SMTP Tab ──────────────────────────────────────────────────────────

function EmailTab() {
  const { addToast } = useToast()
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.getSettings })
  const [smtpHost, setSmtpHost] = useState('')
  const [smtpPort, setSmtpPort] = useState('587')
  const [smtpUser, setSmtpUser] = useState('')
  const [smtpPass, setSmtpPass] = useState('')
  const [smtpFrom, setSmtpFrom] = useState('')
  const [smtpTls, setSmtpTls] = useState(true)
  const [testRecipient, setTestRecipient] = useState('')
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)

  useEffect(() => {
    if (settings) {
      setSmtpHost(String(settings.smtp_host || ''))
      setSmtpPort(String(settings.smtp_port || '587'))
      setSmtpUser(String(settings.smtp_user || settings.smtp_username || ''))
      setSmtpFrom(String(settings.smtp_from || settings.smtp_sender || ''))
      setSmtpTls((settings.smtp_tls ?? 'true') !== 'false')
    }
  }, [settings])

  const saveMutation = useMutation({
    mutationFn: () => api.saveSettings({
      smtp_host: smtpHost, smtp_port: smtpPort, smtp_user: smtpUser,
      smtp_password: smtpPass || undefined, smtp_sender: smtpFrom,
      smtp_tls: smtpTls ? 'true' : 'false',
    }),
    onSuccess: () => addToast('success', 'SMTP settings saved'),
    onError: (e: Error) => addToast('error', e.message),
  })

  const testConnMutation = useMutation({
    mutationFn: () => fetch('/api/settings/test-smtp', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ smtp_host: smtpHost, smtp_port: smtpPort, smtp_user: smtpUser, smtp_password: smtpPass, use_tls: smtpTls }),
    }).then(r => r.json()),
    onSuccess: (data: { success?: boolean; error?: string }) => {
      setTestResult({ ok: !!data.success, msg: data.success ? '✓ Connection successful' : ('✗ ' + (data.error || 'Connection failed')) })
    },
    onError: (e: Error) => setTestResult({ ok: false, msg: '✗ ' + e.message }),
  })

  const testSendMutation = useMutation({
    mutationFn: () => {
      if (!testRecipient.trim()) throw new Error('Enter a test recipient email')
      return api.sendTestEmail({
        smtp_host: smtpHost, smtp_port: smtpPort, smtp_user: smtpUser,
        smtp_password: smtpPass, use_tls: smtpTls, sender_email: smtpFrom, recipient: testRecipient.trim(),
      })
    },
    onSuccess: (data) => setTestResult({ ok: !!data.success, msg: data.success ? ('✓ ' + (data.message || 'Test email sent!')) : ('✗ ' + (data.error || 'Failed')) }),
    onError: (e: Error) => setTestResult({ ok: false, msg: '✗ ' + e.message }),
  })

  return (
    <div className="space-y-6">
      <section className="card p-5 space-y-4">
        <h2 className="text-base font-semibold text-ink">Email (SMTP)</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-ink-muted mb-1.5">SMTP Host</label>
            <input className="field" value={smtpHost} onChange={e => setSmtpHost(e.target.value)} placeholder="smtp.gmail.com" />
          </div>
          <div>
            <label className="block text-xs text-ink-muted mb-1.5">Port</label>
            <input className="field" value={smtpPort} onChange={e => setSmtpPort(e.target.value)} placeholder="587" type="number" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-ink-muted mb-1.5">Username</label>
            <input className="field" value={smtpUser} onChange={e => setSmtpUser(e.target.value)} placeholder="user@gmail.com" />
          </div>
          <div>
            <label className="block text-xs text-ink-muted mb-1.5">Password</label>
            <input className="field" type="password" value={smtpPass} onChange={e => setSmtpPass(e.target.value)} placeholder="••••••••" />
          </div>
        </div>
        <div>
          <label className="block text-xs text-ink-muted mb-1.5">From Address</label>
          <input className="field" value={smtpFrom} onChange={e => setSmtpFrom(e.target.value)} placeholder="noreply@example.com" />
        </div>
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={smtpTls} onChange={e => setSmtpTls(e.target.checked)} className="accent-accent w-4 h-4" />
          <span className="text-sm text-ink">Use STARTTLS</span>
        </label>

        {testResult && (
          <p className={`text-sm font-medium ${testResult.ok ? 'text-success' : 'text-danger'}`}>{testResult.msg}</p>
        )}

        <div className="flex flex-wrap gap-2">
          <button className="btn-outline text-sm" onClick={() => { setTestResult(null); testConnMutation.mutate() }} disabled={testConnMutation.isPending}>
            {testConnMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Test Connection
          </button>
          <div className="flex gap-2 flex-1">
            <input className="field flex-1 min-w-0" value={testRecipient} onChange={e => setTestRecipient(e.target.value)} placeholder="Test recipient email…" type="email" />
            <button className="btn-outline text-sm shrink-0" onClick={() => { setTestResult(null); testSendMutation.mutate() }} disabled={testSendMutation.isPending || !testRecipient.trim()}>
              {testSendMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Send Test
            </button>
          </div>
        </div>
      </section>

      <button className="btn-primary" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
        {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Save
      </button>
    </div>
  )
}

// ── Library Tab (Tags + File Organization + Stats) ────────────────────────────

function LibraryTab() {
  const { addToast } = useToast()
  const qc = useQueryClient()
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.getSettings })
  const { data: tags = [], refetch: refetchTags } = useQuery({ queryKey: ['tags'], queryFn: api.getTags })
  const { data: stats } = useQuery<Stats>({ queryKey: ['stats'], queryFn: api.getStats })

  const [newTag, setNewTag] = useState('')
  const [renameScheme, setRenameScheme] = useState('original')
  const [customTemplate, setCustomTemplate] = useState('')
  const [folderOrganization, setFolderOrganization] = useState('flat')
  const [bulkStatus, setBulkStatus] = useState<string | null>(null)
  const [bulkPreview, setBulkPreview] = useState<api.BulkRenameResult[]>([])
  const [bulkErrors, setBulkErrors] = useState<{ original: string; error: string }[]>([])
  const [canApply, setCanApply] = useState(false)

  useEffect(() => {
    if (settings) {
      setRenameScheme(String(settings.rename_scheme || 'title_author'))
      setCustomTemplate(String(settings.rename_custom_template || ''))
      setFolderOrganization(String(settings.folder_organization || 'by_author'))
    }
  }, [settings])

  const addTagMutation = useMutation({
    mutationFn: () => api.adminCreateTag(newTag.trim()),
    onSuccess: () => { setNewTag(''); refetchTags(); qc.invalidateQueries({ queryKey: ['tags'] }) },
    onError: (e: Error) => addToast('error', e.message),
  })

  const deleteTagMutation = useMutation({
    mutationFn: (id: number) => api.adminDeleteTag(id),
    onSuccess: () => { refetchTags(); qc.invalidateQueries({ queryKey: ['tags'] }) },
    onError: (e: Error) => addToast('error', e.message),
  })

  const saveMutation = useMutation({
    mutationFn: () => api.saveSettings({ rename_scheme: renameScheme, rename_custom_template: customTemplate, folder_organization: folderOrganization }),
    onSuccess: () => addToast('success', 'Saved'),
    onError: (e: Error) => addToast('error', e.message),
  })

  const previewMutation = useMutation({
    mutationFn: () => api.bulkRename(false),
    onSuccess: (res) => {
      const changed = res.results.filter(r => r.changed)
      const unchanged = res.results.filter(r => !r.changed).length
      setBulkPreview(changed); setBulkErrors(res.errors)
      if (!changed.length && !res.errors.length) {
        setBulkStatus(`All ${unchanged} files already match the current scheme.`); setCanApply(false)
      } else {
        setBulkStatus(`${changed.length} file${changed.length !== 1 ? 's' : ''} will be renamed. ${unchanged} already match.${res.errors.length ? ` ${res.errors.length} error(s).` : ''}`)
        setCanApply(changed.length > 0)
      }
    },
    onError: (e: Error) => addToast('error', e.message),
  })

  const applyMutation = useMutation({
    mutationFn: () => api.bulkRename(true),
    onSuccess: (res) => {
      const changed = res.results.filter(r => r.changed).length
      setBulkStatus(`Done. ${changed} file${changed !== 1 ? 's' : ''} renamed.`)
      setBulkPreview([]); setBulkErrors([]); setCanApply(false)
      qc.invalidateQueries({ queryKey: ['books'] })
    },
    onError: (e: Error) => addToast('error', e.message),
  })

  function formatBytes(bytes: number | null | undefined) {
    if (bytes == null || !isFinite(bytes) || bytes < 0) return '—'
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 ** 3) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
  }

  return (
    <div className="space-y-6">
      {/* Tags */}
      <section className="card p-5">
        <h2 className="text-base font-semibold text-ink mb-4">Tags</h2>
        <div className="flex gap-2 mb-4">
          <input
            className="field flex-1" value={newTag} onChange={e => setNewTag(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && newTag.trim() && addTagMutation.mutate()}
            placeholder="New tag name…"
          />
          <button className="btn-primary px-3" onClick={() => addTagMutation.mutate()} disabled={!newTag.trim() || addTagMutation.isPending}>
            <Plus className="w-4 h-4" />
          </button>
        </div>
        {tags.length === 0 ? (
          <p className="text-sm text-ink-muted">No tags yet.</p>
        ) : (
          <div className="space-y-1">
            {tags.map(t => (
              <div key={t.id} className="flex items-center justify-between px-3 py-2 bg-surface-raised rounded-lg">
                <span className="text-sm text-ink">{t.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-ink-muted">{t.book_count} book{t.book_count !== 1 ? 's' : ''}</span>
                  <button onClick={() => deleteTagMutation.mutate(t.id)} className="text-ink-muted hover:text-danger transition-colors p-1">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* File naming */}
      <section className="card p-5 space-y-4">
        <h2 className="text-base font-semibold text-ink">File Naming</h2>
        <div>
          <label className="block text-xs text-ink-muted mb-1.5">Naming Scheme</label>
          <select className="field" value={renameScheme} onChange={e => setRenameScheme(e.target.value)}>
            <option value="original">Keep original filename</option>
            <option value="title">Title only</option>
            <option value="author_title">Author – Title</option>
            <option value="title_author">Title – Author</option>
            <option value="author_series_title">Author – Series # – Title</option>
            <option value="custom">Custom template…</option>
          </select>
        </div>
        {renameScheme === 'custom' && (
          <div>
            <label className="block text-xs text-ink-muted mb-1.5">Custom Template</label>
            <p className="text-xs text-ink-muted mb-2">Variables: {'{author}'}, {'{title}'}, {'{series}'}, {'{year}'}, {'{format}'}</p>
            <input className="field" value={customTemplate} onChange={e => setCustomTemplate(e.target.value)} placeholder="{author} - {title}" />
          </div>
        )}
      </section>

      {/* Folder organization */}
      <section className="card p-5 space-y-4">
        <h2 className="text-base font-semibold text-ink">Folder Organization</h2>
        <select className="field" value={folderOrganization} onChange={e => setFolderOrganization(e.target.value)}>
          <option value="flat">Flat (no subfolders)</option>
          <option value="by_author">By Author</option>
          <option value="by_format">By Format</option>
          <option value="by_author_format">By Author / Format</option>
        </select>
      </section>

      <button className="btn-primary" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
        {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Save
      </button>

      {/* Bulk rename */}
      <section className="card p-5 space-y-4">
        <h2 className="text-base font-semibold text-ink">Bulk Rename</h2>
        <p className="text-xs text-ink-muted">Preview and apply the current naming scheme to all existing files.</p>
        {bulkStatus && <p className="text-sm text-ink-muted">{bulkStatus}</p>}
        <div className="flex gap-2">
          <button className="btn-outline text-sm" onClick={() => previewMutation.mutate()} disabled={previewMutation.isPending || applyMutation.isPending}>
            {previewMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Preview
          </button>
          <button className="btn-primary text-sm" onClick={() => applyMutation.mutate()} disabled={!canApply || applyMutation.isPending}>
            {applyMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Apply
          </button>
        </div>
        {(bulkPreview.length > 0 || bulkErrors.length > 0) && (
          <div className="max-h-64 overflow-y-auto space-y-1 text-xs font-mono">
            {bulkPreview.map((r, i) => (
              <div key={i} className="flex items-start gap-2 py-1 border-b border-line last:border-0">
                <span className="text-ink-muted truncate flex-1 min-w-0">{r.original}</span>
                <span className="text-accent shrink-0">→</span>
                <span className="truncate flex-1 min-w-0">{r.new}</span>
              </div>
            ))}
            {bulkErrors.map((e, i) => <div key={i} className="py-1 text-danger">{e.original}: {e.error}</div>)}
          </div>
        )}
      </section>

      {/* Library stats at bottom */}
      {stats && (
        <section className="card p-5 space-y-4">
          <h2 className="text-base font-semibold text-ink">Library Statistics</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-surface-raised rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-ink">{stats.total_books.toLocaleString()}</p>
              <p className="text-xs text-ink-muted mt-1">Total Books</p>
            </div>
            <div className="bg-surface-raised rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-ink">{formatBytes(stats.total_size_bytes)}</p>
              <p className="text-xs text-ink-muted mt-1">Library Size</p>
            </div>
          </div>
          {stats.formats && Object.keys(stats.formats).length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(stats.formats).sort((a, b) => b[1] - a[1]).map(([fmt, count]) => (
                <div key={fmt} className="flex items-center justify-between px-3 py-2 bg-surface-raised rounded-lg">
                  <span className="text-xs font-mono font-semibold text-ink-muted uppercase">{fmt}</span>
                  <span className="text-sm font-bold text-ink">{count.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}

// ── EPUB Cleanup Tab ──────────────────────────────────────────────────────────

const CLEANUP_STEPS: { id: string; label: string; description: string }[] = [
  { id: 'metadata',    label: 'Write metadata into the file', description: "Save Bookie's title, author, series and ISBN into the EPUB so readers like KOReader show the same details" },
  { id: 'distributor', label: 'Remove distributor pages',     description: "Drop short pages added by ePubLibre, Anna's Archive and similar releases, plus their logos" },
  { id: 'junk',        label: 'Remove conversion leftovers',  description: 'Strip empty Calibre anchors and page-break divs, invisible word joiners, and Adobe/Sigil/Calibre tags' },
  { id: 'headings',    label: 'Fix chapter headings',         description: 'Turn a chapter\'s styled first line ("Chapter 3", "IV", "Epilogue") into a real heading' },
  { id: 'titles',      label: 'Fill empty page titles',       description: "Give each page a title from its heading" },
  { id: 'toc',         label: 'Rebuild missing table of contents', description: 'When the table of contents is empty or has a single entry, rebuild it from the chapter headings' },
  { id: 'toc_case',    label: 'Fix all-caps table of contents', description: 'Change entries like "CHAPTER ONE: THE WRONG DOOR" to "Chapter One: The Wrong Door". Chapter pages are not changed' },
]

function CleanupTab() {
  const { addToast } = useToast()
  const qc = useQueryClient()
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.getSettings })
  const { data: stats } = useQuery<Stats>({ queryKey: ['stats'], queryFn: api.getStats })

  const [onUpload, setOnUpload] = useState(false)
  const [steps, setSteps] = useState<Set<string>>(new Set(CLEANUP_STEPS.map(s => s.id)))
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [result, setResult] = useState<api.BulkCleanupResult | null>(null)

  useEffect(() => {
    if (settings) {
      setOnUpload(settings.epub_cleanup_on_upload === 'true')
      // Unset means every step is on
      const raw = settings.epub_cleanup_steps
      if (typeof raw === 'string') setSteps(new Set(raw.split(',').filter(Boolean)))
    }
  }, [settings])

  const saveMutation = useMutation({
    mutationFn: () => api.saveSettings({
      epub_cleanup_on_upload: onUpload ? 'true' : 'false',
      epub_cleanup_steps: CLEANUP_STEPS.map(s => s.id).filter(id => steps.has(id)).join(','),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings'] }); addToast('success', 'Saved') },
    onError: (e: Error) => addToast('error', e.message),
  })

  function toggleStep(id: string) {
    setSteps(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  async function cleanLibrary() {
    const epubCount = stats?.formats?.epub ?? 0
    if (!window.confirm(`Clean up ${epubCount ? `all ${epubCount} EPUB files` : 'every EPUB'} in the library with the saved steps? Files are changed in place.`)) return
    setResult(null)
    try {
      const { ids } = await api.getBookIds({ format: 'epub' })
      setProgress({ done: 0, total: ids.length })
      const res = await api.cleanupInBatches(ids, (done, total) => setProgress({ done, total }))
      setResult(res)
      qc.invalidateQueries({ queryKey: ['books'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
    } catch (e) {
      addToast('error', (e as Error).message)
    } finally {
      setProgress(null)
    }
  }

  const dirty = settings && (
    (settings.epub_cleanup_on_upload === 'true') !== onUpload ||
    (typeof settings.epub_cleanup_steps === 'string'
      ? settings.epub_cleanup_steps
      : CLEANUP_STEPS.map(s => s.id).join(',')) !== CLEANUP_STEPS.map(s => s.id).filter(id => steps.has(id)).join(',')
  )

  return (
    <div className="space-y-4">
      <section className="card p-5 space-y-4">
        <h2 className="text-base font-semibold text-ink">On Upload</h2>
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={onUpload} onChange={e => setOnUpload(e.target.checked)} className="accent-accent w-4 h-4" />
          <div>
            <p className="text-sm text-ink">Clean up EPUBs on upload</p>
            <p className="text-xs text-ink-muted">Run the steps below on every EPUB you upload, after its metadata is fetched</p>
          </div>
        </label>
      </section>

      <section className="card p-5 space-y-4">
        <h2 className="text-base font-semibold text-ink">Cleanup Steps</h2>
        <p className="text-xs text-ink-muted">Used on upload, from a book's details, and for bulk cleanup. The story text is never changed.</p>
        {CLEANUP_STEPS.map(step => (
          <label key={step.id} className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={steps.has(step.id)} onChange={() => toggleStep(step.id)} className="accent-accent w-4 h-4" />
            <div>
              <p className="text-sm text-ink">{step.label}</p>
              <p className="text-xs text-ink-muted">{step.description}</p>
            </div>
          </label>
        ))}
        <button className="btn-primary" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save
        </button>
      </section>

      <section className="card p-5 space-y-4">
        <h2 className="text-base font-semibold text-ink">Clean Up Library</h2>
        <p className="text-xs text-ink-muted">
          Run the saved steps on every EPUB already in the library. To clean only some books, select them in the
          library and choose Clean Up. Books already on a device keep their old copy until downloaded again.
        </p>
        {dirty && <p className="text-xs text-accent">Save your changes above first, the cleanup uses the saved steps.</p>}
        <button className="btn-outline text-sm" onClick={cleanLibrary} disabled={progress !== null || steps.size === 0}>
          {progress ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          {progress ? `Cleaning ${progress.done}/${progress.total}…` : 'Clean Up All EPUBs'}
        </button>
        {result && (
          <div className="text-sm text-ink-muted space-y-1">
            <p>Done. {result.cleaned} cleaned, {result.unchanged} already clean{result.errors.length ? `, ${result.errors.length} failed` : ''}.</p>
            {result.errors.length > 0 && (
              <div className="max-h-48 overflow-y-auto space-y-1 text-xs font-mono">
                {result.errors.map(e => <div key={e.id} className="text-danger">{e.title ?? `Book ${e.id}`}: {e.error}</div>)}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  )
}

// ── Metadata Tab ──────────────────────────────────────────────────────────────

function MetadataTab() {
  const { addToast } = useToast()
  const qc = useQueryClient()
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.getSettings })
  const { data: srcData } = useQuery({ queryKey: ['metadataSources'], queryFn: api.getMetadataSources })

  const [autoMetadata, setAutoMetadata] = useState(false)
  const [metaReplaceMissing, setMetaReplaceMissing] = useState(true)
  const [applyMetaCover, setApplyMetaCover] = useState(true)
  const [priority, setPriority] = useState<string[]>([])
  const [disabled, setDisabled] = useState<Set<string>>(new Set())
  const dragSrc = useRef<number | null>(null)

  useEffect(() => {
    if (settings) {
      setAutoMetadata((settings.auto_metadata ?? 'false') === 'true')
      setMetaReplaceMissing((settings.meta_replace_missing ?? 'true') === 'true')
      setApplyMetaCover((settings.apply_meta_cover ?? 'true') !== 'false')
    }
  }, [settings])

  useEffect(() => {
    if (srcData) {
      const ordered = [
        ...srcData.priority.filter((s: string) => srcData.all.includes(s)),
        ...srcData.all.filter((s: string) => !srcData.priority.includes(s)),
      ]
      setPriority(ordered)
      setDisabled(new Set(srcData.disabled))
    }
  }, [srcData])

  const saveSettingsMutation = useMutation({
    mutationFn: () => api.saveSettings({ auto_metadata: autoMetadata ? 'true' : 'false', meta_replace_missing: metaReplaceMissing ? 'true' : 'false', apply_meta_cover: applyMetaCover ? 'true' : 'false' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings'] }); addToast('success', 'Saved') },
    onError: (e: Error) => addToast('error', e.message),
  })

  const saveSourcesMutation = useMutation({
    mutationFn: () => api.saveMetadataSources({ priority, disabled: [...disabled] }),
    onSuccess: () => addToast('success', 'Sources saved'),
    onError: (e: Error) => addToast('error', e.message),
  })

  function toggleDisabled(source: string) {
    setDisabled(prev => { const n = new Set(prev); n.has(source) ? n.delete(source) : n.add(source); return n })
  }

  const sourceLabels = srcData?.labels ?? { open_library: 'Open Library', itunes: 'Apple Books', goodreads: 'Goodreads' }

  return (
    <div className="space-y-4">
      <section className="card p-5 space-y-4">
        <h2 className="text-base font-semibold text-ink">Behavior</h2>
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={autoMetadata} onChange={e => setAutoMetadata(e.target.checked)} className="accent-accent w-4 h-4" />
          <div>
            <p className="text-sm text-ink">Auto-download metadata on import</p>
            <p className="text-xs text-ink-muted">Automatically fetch metadata when a new book is added</p>
          </div>
        </label>
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={metaReplaceMissing} onChange={e => setMetaReplaceMissing(e.target.checked)} className="accent-accent w-4 h-4" />
          <div>
            <p className="text-sm text-ink">Only replace missing fields</p>
            <p className="text-xs text-ink-muted">Skip fields that already have values when importing metadata</p>
          </div>
        </label>
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={applyMetaCover} onChange={e => setApplyMetaCover(e.target.checked)} className="accent-accent w-4 h-4" />
          <div>
            <p className="text-sm text-ink">Apply cover image from metadata</p>
            <p className="text-xs text-ink-muted">When saving metadata, also update the book cover from the search result</p>
          </div>
        </label>
        <button className="btn-primary" onClick={() => saveSettingsMutation.mutate()} disabled={saveSettingsMutation.isPending}>
          {saveSettingsMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save
        </button>
      </section>

      <section className="card p-5 space-y-3">
        <h2 className="text-base font-semibold text-ink">Source Priority</h2>
        <p className="text-xs text-ink-muted">Sources are ordered by priority, top to bottom.</p>
        <div className="space-y-1">
          {priority.map((src, idx) => (
            <div
              key={src}
              draggable
              onDragStart={() => { dragSrc.current = idx }}
              onDragOver={e => { e.preventDefault() }}
              onDrop={() => {
                if (dragSrc.current === null || dragSrc.current === idx) return
                const next = [...priority]
                const [moved] = next.splice(dragSrc.current, 1)
                next.splice(idx, 0, moved)
                setPriority(next)
                dragSrc.current = null
              }}
              onDragEnd={() => { dragSrc.current = null }}
              className="flex items-center gap-3 px-3 py-2.5 bg-surface-raised rounded-lg cursor-grab active:cursor-grabbing select-none"
            >
              {/* drag handle */}
              <svg className="w-4 h-4 text-ink-faint shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 9H4v2h16V9zM4 15h16v-2H4v2z"/>
              </svg>
              <span className="flex-1 text-sm text-ink">{sourceLabels[src] ?? src}</span>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={!disabled.has(src)} onChange={() => toggleDisabled(src)} className="accent-accent" />
                <span className="text-xs text-ink-muted">Enabled</span>
              </label>
            </div>
          ))}
        </div>
        <button className="btn-primary" onClick={() => saveSourcesMutation.mutate()} disabled={saveSourcesMutation.isPending}>
          {saveSourcesMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save
        </button>
      </section>
    </div>
  )
}

// ── Logs Tab ──────────────────────────────────────────────────────────────────

function LogsTab() {
  const { addToast } = useToast()
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.getSettings })
  const [level, setLevel] = useState('INFO')
  const [logs, setLogs] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const logRef = useRef<HTMLPreElement>(null)

  // Sync level from persisted settings once loaded
  useEffect(() => {
    const saved = (settings as Record<string, string> | undefined)?.log_level
    if (saved) setLevel(saved)
  }, [(settings as Record<string, string> | undefined)?.log_level])

  async function loadLogs(lvl = level) {
    setLoading(true)
    try {
      const data = await api.getLogs(lvl)
      const text = (data.logs || []).join('\n') || '(no log entries)'
      setLogs(text)
      requestAnimationFrame(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight })
    } catch (e) {
      addToast('error', (e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function changeLevel(lvl: string) {
    setLevel(lvl)
    try { await api.setLogLevel(lvl) } catch { /* ignore */ }
    loadLogs(lvl)
  }

  function exportLogs() {
    if (!logs) return
    const blob = new Blob([logs], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `bookie-logs-${new Date().toISOString().slice(0, 10)}.txt`
    a.click(); URL.revokeObjectURL(a.href)
  }

  useEffect(() => { loadLogs() }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select className="field w-36" value={level} onChange={e => changeLevel(e.target.value)}>
          <option value="DEBUG">DEBUG</option>
          <option value="INFO">INFO</option>
          <option value="WARNING">WARNING</option>
          <option value="ERROR">ERROR</option>
        </select>
        <button onClick={() => loadLogs()} disabled={loading} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm border border-line hover:bg-surface-raised transition-colors">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Refresh
        </button>
        <button onClick={exportLogs} disabled={!logs} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm border border-line hover:bg-surface-raised transition-colors">
          <Download className="w-3.5 h-3.5" />
          Export
        </button>
      </div>
      <pre ref={logRef} className="w-full h-96 overflow-auto rounded-lg bg-surface-raised border border-line p-4 text-xs font-mono text-ink-muted whitespace-pre-wrap leading-relaxed">
        {loading ? 'Loading…' : (logs || '(no log entries)')}
      </pre>
    </div>
  )
}

// ── Account Tab ───────────────────────────────────────────────────────────────

function AccountTab() {
  const { addToast } = useToast()
  const qc = useQueryClient()
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwError, setPwError] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newEmailLabel, setNewEmailLabel] = useState('')
  const [displayName, setDisplayName] = useState('')

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.getSettings })

  useEffect(() => {
    if (settings?.display_name) setDisplayName(String(settings.display_name))
  }, [settings])

  const opdsEnabled = settings?.opds_enabled === 'true'
  const opdsUrl = `${window.location.origin}/opds`
  const opdsMutation = useMutation({
    mutationFn: (enabled: boolean) => api.saveSettings({ opds_enabled: enabled ? 'true' : 'false' }),
    onSuccess: (_, enabled) => {
      qc.invalidateQueries({ queryKey: ['settings'] })
      addToast('success', enabled ? 'OPDS feed enabled' : 'OPDS feed disabled')
    },
    onError: (e: Error) => addToast('error', e.message),
  })

  const kosyncEnabled = settings?.kosync_enabled === 'true'
  const kosyncUrl = `${window.location.origin}/kosync`
  const kosyncMutation = useMutation({
    mutationFn: (enabled: boolean) => api.saveSettings({ kosync_enabled: enabled ? 'true' : 'false' }),
    onSuccess: (_, enabled) => {
      qc.invalidateQueries({ queryKey: ['settings'] })
      addToast('success', enabled ? 'KOReader sync enabled' : 'KOReader sync disabled')
    },
    onError: (e: Error) => addToast('error', e.message),
  })

  const saveDisplayNameMutation = useMutation({
    mutationFn: () => api.saveSettings({ display_name: displayName.trim() }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings'] }); addToast('success', 'Display name saved') },
    onError: (e: Error) => addToast('error', e.message),
  })

  const { data: emailAddresses = [] } = useQuery<EmailAddress[]>({
    queryKey: ['emailAddresses'],
    queryFn: api.getEmailAddresses,
  })

  const addEmailMutation = useMutation({
    mutationFn: () => api.addEmailAddress({ email: newEmail.trim(), label: newEmailLabel.trim() || undefined }),
    onSuccess: () => { setNewEmail(''); setNewEmailLabel(''); qc.invalidateQueries({ queryKey: ['emailAddresses'] }); addToast('success', 'Email address added') },
    onError: (e: Error) => addToast('error', e.message),
  })

  const deleteEmailMutation = useMutation({
    mutationFn: (id: number) => api.deleteEmailAddress(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['emailAddresses'] }),
    onError: (e: Error) => addToast('error', e.message),
  })

  const setDefaultEmailMutation = useMutation({
    mutationFn: (id: number) => api.setDefaultEmailAddress(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['emailAddresses'] }),
    onError: (e: Error) => addToast('error', e.message),
  })

  const changeMutation = useMutation({
    mutationFn: () => api.changePassword(currentPw, newPw),
    onSuccess: () => { addToast('success', 'Password changed'); setCurrentPw(''); setNewPw(''); setConfirmPw(''); setPwError('') },
    onError: (e: Error) => addToast('error', e.message),
  })

  function submit() {
    if (newPw.length < 8) { setPwError('Password must be at least 8 characters'); return }
    if (newPw !== confirmPw) { setPwError('Passwords do not match'); return }
    setPwError(''); changeMutation.mutate()
  }

  return (
    <div className="space-y-6">
      {/* Display Name */}
      <section className="card p-5 space-y-4">
        <h2 className="text-base font-semibold text-ink">Display Name</h2>
        <div className="flex gap-2">
          <input
            className="field flex-1"
            placeholder="Enter display name…"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && saveDisplayNameMutation.mutate()}
          />
          <button
            className="btn-primary shrink-0"
            onClick={() => saveDisplayNameMutation.mutate()}
            disabled={saveDisplayNameMutation.isPending}
          >
            {saveDisplayNameMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save
          </button>
        </div>
      </section>

      {/* Send-to email addresses */}
      <section className="card p-5 space-y-4">
        <h2 className="text-base font-semibold text-ink flex items-center gap-2">
          <Mail className="w-4 h-4 text-ink-muted" />
          Send-to Email
        </h2>
        <p className="text-xs text-ink-muted">Add email addresses to send books to.</p>
        {emailAddresses.length > 0 && (
          <div className="space-y-1">
            {emailAddresses.map(addr => (
              <div key={addr.id} className="flex items-center gap-2 px-3 py-2 bg-surface-raised rounded-lg">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-ink truncate">{addr.label || addr.email}</p>
                  {addr.label && <p className="text-xs text-ink-muted truncate">{addr.email}</p>}
                </div>
                {addr.is_default && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-accent bg-accent-muted px-1.5 py-0.5 rounded">Default</span>
                )}
                {!addr.is_default && (
                  <button onClick={() => setDefaultEmailMutation.mutate(addr.id)} className="text-xs text-ink-muted hover:text-ink transition-colors">Set default</button>
                )}
                <button onClick={() => deleteEmailMutation.mutate(addr.id)} className="text-ink-muted hover:text-danger transition-colors p-1">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        {/* Fields side-by-side on sm+, stacked on mobile, then Add Email button */}
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            className="field flex-1"
            placeholder="Andy Dwyer's eReader"
            value={newEmailLabel}
            onChange={e => setNewEmailLabel(e.target.value)}
          />
          <input
            className="field flex-1"
            type="email"
            placeholder="andy@mouseratband.com"
            value={newEmail}
            onChange={e => setNewEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && newEmail.trim() && addEmailMutation.mutate()}
          />
          <button
            className="btn-primary shrink-0"
            onClick={() => addEmailMutation.mutate()}
            disabled={!newEmail.trim() || addEmailMutation.isPending}
          >
            {addEmailMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add Email
          </button>
        </div>
      </section>

      {/* OPDS feed for e-reader apps */}
      <section className="card p-5 space-y-4">
        <h2 className="text-base font-semibold text-ink flex items-center gap-2">
          <Rss className="w-4 h-4 text-ink-muted" />
          OPDS Feed
        </h2>
        <p className="text-xs text-ink-muted">
          Lets e-reader apps such as KOReader browse and download your library. Sign in from the app with your Bookie username and password.
        </p>
        <label className="flex items-center gap-2 text-sm text-ink cursor-pointer">
          <input
            type="checkbox"
            checked={opdsEnabled}
            onChange={e => opdsMutation.mutate(e.target.checked)}
            disabled={opdsMutation.isPending}
          />
          Enable OPDS feed
        </label>
        {opdsEnabled && (
          <div>
            <label className="block text-xs text-ink-muted mb-1.5">Feed URL</label>
            <input className="field font-mono text-xs" readOnly value={opdsUrl} onFocus={e => e.target.select()} />
          </div>
        )}
      </section>

      {/* KOReader progress sync */}
      <section className="card p-5 space-y-4">
        <h2 className="text-base font-semibold text-ink flex items-center gap-2">
          <RefreshCw className="w-4 h-4 text-ink-muted" />
          KOReader Sync
        </h2>
        <p className="text-xs text-ink-muted">
          Keeps your reading position in step across KOReader devices and shows how far you are through each book. In KOReader, open Tools &gt; Progress sync &gt; Custom sync server, enter the URL below, then log in with your Bookie username and password.
        </p>
        <label className="flex items-center gap-2 text-sm text-ink cursor-pointer">
          <input
            type="checkbox"
            checked={kosyncEnabled}
            onChange={e => kosyncMutation.mutate(e.target.checked)}
            disabled={kosyncMutation.isPending}
          />
          Enable KOReader sync
        </label>
        {kosyncEnabled && (
          <div>
            <label className="block text-xs text-ink-muted mb-1.5">Sync server URL</label>
            <input className="field font-mono text-xs" readOnly value={kosyncUrl} onFocus={e => e.target.select()} />
          </div>
        )}
        {kosyncEnabled && settings?.kosync_key_set === false && (
          <p className="text-xs text-ink-muted flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            Sign out of Bookie and back in once, or open the OPDS feed in KOReader, so KOReader can log in with your password.
          </p>
        )}
      </section>

      {/* Change password */}
      <section className="card p-5 space-y-4">
        <h2 className="text-base font-semibold text-ink flex items-center gap-2">
          <Key className="w-4 h-4 text-ink-muted" />
          Change Password
        </h2>
        <div>
          <label className="block text-xs text-ink-muted mb-1.5">Current Password</label>
          <input className="field" type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-ink-muted mb-1.5">New Password</label>
          <input className="field" type="password" value={newPw} onChange={e => setNewPw(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-ink-muted mb-1.5">Confirm New Password</label>
          <input className="field" type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} />
        </div>
        {pwError && (
          <div className="flex items-center gap-2 text-danger text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {pwError}
          </div>
        )}
        <button className="btn-primary" onClick={submit} disabled={!currentPw || !newPw || !confirmPw || changeMutation.isPending}>
          {changeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
          Update Password
        </button>
      </section>
    </div>
  )
}
