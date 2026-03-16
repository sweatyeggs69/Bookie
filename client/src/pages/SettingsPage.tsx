import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, Plus, Trash2, Loader2, AlertCircle, Key, Mail, RefreshCw, Download } from 'lucide-react'
import { useToast } from '../App'
import * as api from '../api/client'
import type { EmailAddress, Stats } from '../types'

type Tab = 'general' | 'organization' | 'metadata' | 'libstats' | 'logs' | 'account'

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('general')

  const tabs: { id: Tab; label: string }[] = [
    { id: 'general', label: 'General' },
    { id: 'organization', label: 'File Organization' },
    { id: 'metadata', label: 'Metadata' },
    { id: 'libstats', label: 'Library Stats' },
    { id: 'logs', label: 'Logs' },
    { id: 'account', label: 'Account' },
  ]

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-lg font-semibold text-ink mb-6">Settings</h1>

      {/* Tab bar */}
      <div className="flex gap-1 bg-surface-raised p-1 rounded-xl mb-6 overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors
              ${tab === t.id ? 'bg-surface-high text-ink' : 'text-ink-muted hover:text-ink'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'general' && <GeneralTab />}
      {tab === 'organization' && <OrganizationTab />}
      {tab === 'metadata' && <MetadataTab />}
      {tab === 'libstats' && <LibStatsTab />}
      {tab === 'logs' && <LogsTab />}
      {tab === 'account' && <AccountTab />}
    </div>
  )
}

// ── General Tab (SMTP) ───────────────────────────────────────────────────────

function GeneralTab() {
  const { addToast } = useToast()
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.getSettings })
  const [libraryName, setLibraryName] = useState('')
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
      setLibraryName(String(settings.library_name || ''))
      setSmtpHost(String(settings.smtp_host || ''))
      setSmtpPort(String(settings.smtp_port || '587'))
      setSmtpUser(String(settings.smtp_user || settings.smtp_username || ''))
      setSmtpFrom(String(settings.smtp_from || settings.smtp_sender || ''))
      setSmtpTls((settings.smtp_tls ?? 'true') !== 'false')
    }
  }, [settings])

  const saveMutation = useMutation({
    mutationFn: () => api.saveSettings({
      library_name: libraryName,
      smtp_host: smtpHost,
      smtp_port: smtpPort,
      smtp_user: smtpUser,
      smtp_password: smtpPass || undefined,
      smtp_sender: smtpFrom,
      smtp_tls: smtpTls ? 'true' : 'false',
    }),
    onSuccess: () => addToast('success', 'Settings saved'),
    onError: (e: Error) => addToast('error', e.message),
  })

  const testConnMutation = useMutation({
    mutationFn: () => fetch('/api/settings/test-smtp', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        smtp_host: smtpHost, smtp_port: smtpPort, smtp_user: smtpUser,
        smtp_password: smtpPass, use_tls: smtpTls,
      }),
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
        smtp_password: smtpPass, use_tls: smtpTls,
        sender_email: smtpFrom, recipient: testRecipient.trim(),
      })
    },
    onSuccess: (data) => {
      setTestResult({ ok: !!data.success, msg: data.success ? ('✓ ' + (data.message || 'Test email sent!')) : ('✗ ' + (data.error || 'Failed')) })
    },
    onError: (e: Error) => setTestResult({ ok: false, msg: '✗ ' + e.message }),
  })

  return (
    <div className="space-y-6">
      {/* Library */}
      <section className="card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-ink">Library</h2>
        <div>
          <label className="block text-xs text-ink-muted mb-1.5">Library Name</label>
          <input className="field" value={libraryName} onChange={e => setLibraryName(e.target.value)} placeholder="My Library" />
        </div>
      </section>

      {/* SMTP */}
      <section className="card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-ink">Email (SMTP)</h2>
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
        {/* STARTTLS toggle */}
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={smtpTls}
            onChange={e => setSmtpTls(e.target.checked)}
            className="accent-accent w-4 h-4"
          />
          <span className="text-sm text-ink">Use STARTTLS</span>
        </label>

        {/* Test result */}
        {testResult && (
          <p className={`text-sm font-medium ${testResult.ok ? 'text-green-400' : 'text-danger'}`}>{testResult.msg}</p>
        )}

        {/* Test buttons */}
        <div className="flex flex-wrap gap-2">
          <button
            className="btn-outline text-sm"
            onClick={() => { setTestResult(null); testConnMutation.mutate() }}
            disabled={testConnMutation.isPending}
          >
            {testConnMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Test Connection
          </button>

          <div className="flex gap-2 flex-1">
            <input
              className="field flex-1 min-w-0"
              value={testRecipient}
              onChange={e => setTestRecipient(e.target.value)}
              placeholder="Test recipient email…"
              type="email"
            />
            <button
              className="btn-outline text-sm shrink-0"
              onClick={() => { setTestResult(null); testSendMutation.mutate() }}
              disabled={testSendMutation.isPending || !testRecipient.trim()}
            >
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

// ── Organization Tab ──────────────────────────────────────────────────────────

function OrganizationTab() {
  const { addToast } = useToast()
  const qc = useQueryClient()
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.getSettings })
  const { data: tags = [], refetch: refetchTags } = useQuery({ queryKey: ['tags'], queryFn: api.adminGetTags })

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
      const scheme = String(settings.rename_scheme || 'original')
      setRenameScheme(scheme)
      setCustomTemplate(String(settings.rename_custom_template || ''))
      setFolderOrganization(String(settings.folder_organization || 'flat'))
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
    mutationFn: () => api.saveSettings({
      rename_scheme: renameScheme,
      rename_custom_template: customTemplate,
      folder_organization: folderOrganization,
    }),
    onSuccess: () => addToast('success', 'Saved'),
    onError: (e: Error) => addToast('error', e.message),
  })

  const previewMutation = useMutation({
    mutationFn: () => api.bulkRename(false),
    onSuccess: (res) => {
      const changed = res.results.filter(r => r.changed)
      const unchanged = res.results.filter(r => !r.changed).length
      setBulkPreview(changed)
      setBulkErrors(res.errors)
      if (!changed.length && !res.errors.length) {
        setBulkStatus(`All ${unchanged} files already match the current scheme.`)
        setCanApply(false)
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
      setBulkStatus(`Done. ${changed} file${changed !== 1 ? 's' : ''} renamed.${res.errors.length ? ` ${res.errors.length} error(s).` : ''}`)
      setBulkPreview([])
      setBulkErrors([])
      setCanApply(false)
      qc.invalidateQueries({ queryKey: ['books'] })
    },
    onError: (e: Error) => addToast('error', e.message),
  })

  return (
    <div className="space-y-6">
      {/* Tags */}
      <section className="card p-5">
        <h2 className="text-sm font-semibold text-ink mb-4">Tags</h2>
        <div className="flex gap-2 mb-4">
          <input
            className="field flex-1"
            value={newTag}
            onChange={e => setNewTag(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && newTag.trim() && addTagMutation.mutate()}
            placeholder="New tag name…"
          />
          <button
            className="btn-primary px-3"
            onClick={() => addTagMutation.mutate()}
            disabled={!newTag.trim() || addTagMutation.isPending}
          >
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

      {/* Naming scheme */}
      <section className="card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-ink">File Naming</h2>
        <div>
          <label className="block text-xs text-ink-muted mb-1.5">Naming Scheme</label>
          <select
            className="field"
            value={renameScheme}
            onChange={e => setRenameScheme(e.target.value)}
          >
            <option value="original">Keep original filename</option>
            <option value="title">Title only</option>
            <option value="author_title">Author – Title</option>
            <option value="author_series_title">Author – Series # – Title</option>
            <option value="custom">Custom template…</option>
          </select>
        </div>
        {renameScheme === 'custom' && (
          <div>
            <label className="block text-xs text-ink-muted mb-1.5">Custom Template</label>
            <p className="text-xs text-ink-muted mb-2">Variables: {'{author}'}, {'{title}'}, {'{series}'}, {'{year}'}, {'{format}'}</p>
            <input
              className="field"
              value={customTemplate}
              onChange={e => setCustomTemplate(e.target.value)}
              placeholder="{author} - {title}"
            />
          </div>
        )}
      </section>

      {/* Folder organization */}
      <section className="card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-ink">Folder Organization</h2>
        <div>
          <label className="block text-xs text-ink-muted mb-1.5">Folder Structure</label>
          <select
            className="field"
            value={folderOrganization}
            onChange={e => setFolderOrganization(e.target.value)}
          >
            <option value="flat">Flat (no subfolders)</option>
            <option value="by_author">By Author</option>
            <option value="by_format">By Format</option>
            <option value="by_author_format">By Author / Format</option>
          </select>
        </div>
      </section>

      <button className="btn-primary" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
        {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Save
      </button>

      {/* Bulk rename */}
      <section className="card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-ink">Bulk Rename</h2>
        <p className="text-xs text-ink-muted">Preview and apply the current naming scheme to all existing files.</p>

        {bulkStatus && (
          <p className="text-sm text-ink-muted">{bulkStatus}</p>
        )}

        <div className="flex gap-2">
          <button
            className="btn-outline text-sm"
            onClick={() => previewMutation.mutate()}
            disabled={previewMutation.isPending || applyMutation.isPending}
          >
            {previewMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Preview
          </button>
          <button
            className="btn-primary text-sm"
            onClick={() => applyMutation.mutate()}
            disabled={!canApply || applyMutation.isPending}
          >
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
            {bulkErrors.map((e, i) => (
              <div key={i} className="py-1 text-danger">
                {e.original}: {e.error}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

// ── Metadata Tab ──────────────────────────────────────────────────────────────

function MetadataTab() {
  const { addToast } = useToast()

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.getSettings })
  const { data: srcData } = useQuery({ queryKey: ['metadataSources'], queryFn: api.getMetadataSources })

  const [autoMetadata, setAutoMetadata] = useState(false)
  const [metaReplaceMissing, setMetaReplaceMissing] = useState(true)
  const [priority, setPriority] = useState<string[]>([])
  const [disabled, setDisabled] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (settings) {
      setAutoMetadata((settings.auto_metadata ?? 'false') === 'true')
      setMetaReplaceMissing((settings.meta_replace_missing ?? 'true') === 'true')
    }
  }, [settings])

  useEffect(() => {
    if (srcData) {
      const ordered = [
        ...( srcData.priority.filter(s => srcData.all.includes(s)) ),
        ...( srcData.all.filter(s => !srcData.priority.includes(s)) ),
      ]
      setPriority(ordered)
      setDisabled(new Set(srcData.disabled))
    }
  }, [srcData])

  const saveSettingsMutation = useMutation({
    mutationFn: () => api.saveSettings({
      auto_metadata: autoMetadata ? 'true' : 'false',
      meta_replace_missing: metaReplaceMissing ? 'true' : 'false',
    }),
    onSuccess: () => addToast('success', 'Saved'),
    onError: (e: Error) => addToast('error', e.message),
  })

  const saveSourcesMutation = useMutation({
    mutationFn: () => api.saveMetadataSources({ priority, disabled: [...disabled] }),
    onSuccess: () => addToast('success', 'Sources saved'),
    onError: (e: Error) => addToast('error', e.message),
  })

  function toggleDisabled(source: string) {
    setDisabled(prev => {
      const next = new Set(prev)
      next.has(source) ? next.delete(source) : next.add(source)
      return next
    })
  }

  function moveUp(idx: number) {
    if (idx === 0) return
    const next = [...priority]; [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]; setPriority(next)
  }

  function moveDown(idx: number) {
    if (idx === priority.length - 1) return
    const next = [...priority]; [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]; setPriority(next)
  }

  const sourceLabels = srcData?.labels ?? {
    google_books: 'Google Books',
    open_library: 'Open Library',
    goodreads: 'Goodreads',
  }

  return (
    <div className="space-y-4">
      {/* Behavior toggles */}
      <section className="card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-ink">Behavior</h2>
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
        <button className="btn-primary" onClick={() => saveSettingsMutation.mutate()} disabled={saveSettingsMutation.isPending}>
          {saveSettingsMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save
        </button>
      </section>

      {/* Source priority */}
      <section className="card p-5 space-y-3">
        <h2 className="text-sm font-semibold text-ink">Source Priority</h2>
        <p className="text-xs text-ink-muted">Sources are tried in order. Use arrows to reorder.</p>
        {priority.map((src, idx) => (
          <div key={src} className="flex items-center gap-3 px-3 py-2.5 bg-surface-raised rounded-lg">
            <div className="flex flex-col gap-0.5">
              <button onClick={() => moveUp(idx)} disabled={idx === 0} className="text-ink-muted hover:text-ink disabled:opacity-30 leading-none">▲</button>
              <button onClick={() => moveDown(idx)} disabled={idx === priority.length - 1} className="text-ink-muted hover:text-ink disabled:opacity-30 leading-none">▼</button>
            </div>
            <span className="flex-1 text-sm text-ink">{sourceLabels[src] ?? src}</span>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!disabled.has(src)}
                onChange={() => toggleDisabled(src)}
                className="accent-accent"
              />
              <span className="text-xs text-ink-muted">Enabled</span>
            </label>
          </div>
        ))}
      </section>
      <button className="btn-primary" onClick={() => saveSourcesMutation.mutate()} disabled={saveSourcesMutation.isPending}>
        {saveSourcesMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Save Sources
      </button>
    </div>
  )
}

// ── Library Stats Tab ─────────────────────────────────────────────────────────

function LibStatsTab() {
  const { data: stats, isLoading, refetch } = useQuery<Stats>({
    queryKey: ['stats'],
    queryFn: api.getStats,
  })

  function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Library Statistics</h2>
        <button onClick={() => refetch()} className="flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink transition-colors">
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-ink-muted" /></div>
      ) : stats ? (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="card p-4 text-center">
              <p className="text-2xl font-bold text-ink">{stats.total_books.toLocaleString()}</p>
              <p className="text-xs text-ink-muted mt-1">Total Books</p>
            </div>
            <div className="card p-4 text-center">
              <p className="text-2xl font-bold text-ink">{formatBytes(stats.total_size_bytes)}</p>
              <p className="text-xs text-ink-muted mt-1">Library Size</p>
            </div>
          </div>

          {/* Formats breakdown */}
          {stats.formats && Object.keys(stats.formats).length > 0 && (
            <section className="card p-5">
              <h3 className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-3">By Format</h3>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(stats.formats).sort((a, b) => b[1] - a[1]).map(([fmt, count]) => (
                  <div key={fmt} className="flex items-center justify-between px-3 py-2 bg-surface-raised rounded-lg">
                    <span className="text-xs font-mono font-semibold text-ink-muted uppercase">{fmt}</span>
                    <span className="text-sm font-bold text-ink">{count.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      ) : (
        <p className="text-sm text-ink-muted">Could not load stats.</p>
      )}
    </div>
  )
}

// ── Logs Tab ──────────────────────────────────────────────────────────────────

function LogsTab() {
  const { addToast } = useToast()
  const [level, setLevel] = useState(() => localStorage.getItem('logLevel') || 'INFO')
  const [logs, setLogs] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const logRef = useRef<HTMLPreElement>(null)

  async function loadLogs(lvl = level) {
    setLoading(true)
    try {
      const data = await api.getLogs(lvl)
      const text = (data.logs || []).join('\n') || '(no log entries)'
      setLogs(text)
      requestAnimationFrame(() => {
        if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
      })
    } catch (e) {
      addToast('error', (e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function changeLevel(lvl: string) {
    setLevel(lvl)
    localStorage.setItem('logLevel', lvl)
    try { await api.setLogLevel(lvl) } catch { /* ignore */ }
    loadLogs(lvl)
  }

  function exportLogs() {
    if (!logs) return
    const blob = new Blob([logs], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `bookie-logs-${new Date().toISOString().slice(0, 10)}.txt`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  // Load on mount
  useEffect(() => { loadLogs() }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select
          className="field w-36"
          value={level}
          onChange={e => changeLevel(e.target.value)}
        >
          <option value="DEBUG">DEBUG</option>
          <option value="INFO">INFO</option>
          <option value="WARNING">WARNING</option>
          <option value="ERROR">ERROR</option>
        </select>
        <button
          onClick={() => loadLogs()}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 rounded text-sm border border-line hover:bg-surface-raised transition-colors"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Refresh
        </button>
        <button
          onClick={exportLogs}
          disabled={!logs}
          className="flex items-center gap-1.5 px-3 py-2 rounded text-sm border border-line hover:bg-surface-raised transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Export
        </button>
      </div>
      <pre
        ref={logRef}
        className="w-full h-96 overflow-auto rounded-lg bg-surface-raised border border-line p-4 text-xs font-mono text-ink-muted whitespace-pre-wrap leading-relaxed"
      >
        {loading ? 'Loading…' : (logs || '(no log entries)')}
      </pre>
    </div>
  )
}

// ── Account Tab ───────────────────────────────────────────────────────────────

const THEMES = [
  { id: 'violet', label: 'Violet', color: '#D0BCFF' },
  { id: 'teal',   label: 'Teal',   color: '#80DEEA' },
  { id: 'green',  label: 'Green',  color: '#A8D5A2' },
  { id: 'rose',   label: 'Rose',   color: '#FFB4AB' },
  { id: 'amber',  label: 'Amber',  color: '#FFD873' },
]

const THEME_VARS: Record<string, Record<string, string>> = {
  violet: { '--color-accent': '#a78bfa', '--color-accent-muted': '#a78bfa1a', '--color-accent-hover': '#8b5cf6' },
  teal:   { '--color-accent': '#2dd4bf', '--color-accent-muted': '#2dd4bf1a', '--color-accent-hover': '#14b8a6' },
  green:  { '--color-accent': '#4ade80', '--color-accent-muted': '#4ade801a', '--color-accent-hover': '#22c55e' },
  rose:   { '--color-accent': '#fb7185', '--color-accent-muted': '#fb71851a', '--color-accent-hover': '#f43f5e' },
  amber:  { '--color-accent': '#fbbf24', '--color-accent-muted': '#fbbf241a', '--color-accent-hover': '#f59e0b' },
}

function applyTheme(id: string) {
  const vars = THEME_VARS[id]
  if (!vars) return
  const root = document.documentElement
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v)
  localStorage.setItem('colorTheme', id)
}

function AccountTab() {
  const { addToast } = useToast()
  const qc = useQueryClient()
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwError, setPwError] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newEmailLabel, setNewEmailLabel] = useState('')
  const [activeTheme, setActiveTheme] = useState(() => localStorage.getItem('colorTheme') || 'violet')

  const { data: emailAddresses = [] } = useQuery<EmailAddress[]>({
    queryKey: ['emailAddresses'],
    queryFn: api.getEmailAddresses,
  })

  const addEmailMutation = useMutation({
    mutationFn: () => api.addEmailAddress({ email: newEmail.trim(), label: newEmailLabel.trim() || undefined }),
    onSuccess: () => {
      setNewEmail(''); setNewEmailLabel('')
      qc.invalidateQueries({ queryKey: ['emailAddresses'] })
      addToast('success', 'Email address added')
    },
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
    onSuccess: () => {
      addToast('success', 'Password changed')
      setCurrentPw(''); setNewPw(''); setConfirmPw(''); setPwError('')
    },
    onError: (e: Error) => addToast('error', e.message),
  })

  function selectTheme(id: string) {
    setActiveTheme(id)
    applyTheme(id)
  }

  function submit() {
    if (newPw.length < 8) { setPwError('Password must be at least 8 characters'); return }
    if (newPw !== confirmPw) { setPwError('Passwords do not match'); return }
    setPwError('')
    changeMutation.mutate()
  }

  return (
    <div className="space-y-6">
      {/* Theme picker */}
      <section className="card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-ink">Color Theme</h2>
        <div className="flex gap-3">
          {THEMES.map(t => (
            <button
              key={t.id}
              type="button"
              title={t.label}
              onClick={() => selectTheme(t.id)}
              className={[
                'w-9 h-9 rounded-full border-2 transition-all',
                activeTheme === t.id ? 'border-ink scale-110' : 'border-transparent hover:scale-105',
              ].join(' ')}
              style={{ backgroundColor: t.color }}
            />
          ))}
        </div>
        <p className="text-xs text-ink-muted">Theme is saved locally in your browser.</p>
      </section>

      {/* Email addresses */}
      <section className="card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
          <Mail className="w-4 h-4 text-ink-muted" />
          Send-to Email Addresses
        </h2>
        <p className="text-xs text-ink-muted">Add email addresses to send books to (e.g. your Kindle address).</p>
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
                  <button onClick={() => setDefaultEmailMutation.mutate(addr.id)} className="text-xs text-ink-muted hover:text-ink transition-colors">
                    Set default
                  </button>
                )}
                <button onClick={() => deleteEmailMutation.mutate(addr.id)} className="text-ink-muted hover:text-danger transition-colors p-1">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input className="field flex-1" placeholder="Label (e.g. Kindle)" value={newEmailLabel} onChange={e => setNewEmailLabel(e.target.value)} />
          <input
            className="field flex-1" type="email" placeholder="email@example.com"
            value={newEmail} onChange={e => setNewEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && newEmail.trim() && addEmailMutation.mutate()}
          />
          <button className="btn-primary px-3" onClick={() => addEmailMutation.mutate()} disabled={!newEmail.trim() || addEmailMutation.isPending}>
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* Change password */}
      <section className="card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
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
