import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, Plus, Trash2, Loader2, AlertCircle, Key } from 'lucide-react'
import { useToast } from '../App'
import * as api from '../api/client'

type Tab = 'general' | 'organization' | 'metadata' | 'account'

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('general')

  const tabs: { id: Tab; label: string }[] = [
    { id: 'general', label: 'General' },
    { id: 'organization', label: 'File Organization' },
    { id: 'metadata', label: 'Metadata Sources' },
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
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors flex-1
              ${tab === t.id ? 'bg-surface-high text-ink' : 'text-ink-muted hover:text-ink'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'general' && <GeneralTab />}
      {tab === 'organization' && <OrganizationTab />}
      {tab === 'metadata' && <MetadataTab />}
      {tab === 'account' && <AccountTab />}
    </div>
  )
}

// ── General Tab ─────────────────────────────────────────────────────────────

function GeneralTab() {
  const { addToast } = useToast()
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.getSettings })
  const [libraryName, setLibraryName] = useState('')
  const [smtpHost, setSmtpHost] = useState('')
  const [smtpPort, setSmtpPort] = useState('587')
  const [smtpUser, setSmtpUser] = useState('')
  const [smtpPass, setSmtpPass] = useState('')
  const [smtpFrom, setSmtpFrom] = useState('')

  // Populate from settings when loaded
  useEffect(() => {
    if (settings) {
      setLibraryName(String(settings.library_name || ''))
      setSmtpHost(String(settings.smtp_host || ''))
      setSmtpPort(String(settings.smtp_port || '587'))
      setSmtpUser(String(settings.smtp_username || ''))
      setSmtpFrom(String(settings.smtp_from || ''))
    }
  }, [settings])

  const saveMutation = useMutation({
    mutationFn: () => api.saveSettings({
      library_name: libraryName,
      smtp_host: smtpHost,
      smtp_port: smtpPort,
      smtp_username: smtpUser,
      smtp_password: smtpPass || undefined,
      smtp_from: smtpFrom,
    }),
    onSuccess: () => addToast('success', 'Settings saved'),
    onError: (e: Error) => addToast('error', e.message),
  })

  const testMutation = useMutation({
    mutationFn: () => fetch('/api/settings/test-smtp', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host: smtpHost, port: smtpPort, username: smtpUser, password: smtpPass, from_addr: smtpFrom }),
    }).then(r => r.json()),
    onSuccess: (data: {success?: boolean; message?: string}) => addToast(data.success ? 'success' : 'error', data.message || (data.success ? 'SMTP OK' : 'SMTP failed')),
    onError: (e: Error) => addToast('error', e.message),
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
        <button
          className="btn-outline text-sm"
          onClick={() => testMutation.mutate()}
          disabled={testMutation.isPending}
        >
          {testMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          Test Connection
        </button>
      </section>

      <button className="btn-primary" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
        {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Save
      </button>
    </div>
  )
}

// ── Organization Tab ─────────────────────────────────────────────────────────

function OrganizationTab() {
  const { addToast } = useToast()
  const qc = useQueryClient()
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.getSettings })
  const { data: tags = [], refetch: refetchTags } = useQuery({ queryKey: ['tags'], queryFn: api.adminGetTags })

  const [newTag, setNewTag] = useState('')
  const [namingTemplate, setNamingTemplate] = useState('{author}/{title}')

  useEffect(() => {
    if (settings?.naming_template) {
      setNamingTemplate(String(settings.naming_template))
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
    mutationFn: () => api.saveSettings({ naming_template: namingTemplate }),
    onSuccess: () => addToast('success', 'Saved'),
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
                  <button
                    onClick={() => deleteTagMutation.mutate(t.id)}
                    className="text-ink-muted hover:text-danger transition-colors p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Naming template */}
      <section className="card p-5 space-y-3">
        <h2 className="text-sm font-semibold text-ink">Naming Template</h2>
        <p className="text-xs text-ink-muted">Variables: {'{author}'}, {'{title}'}, {'{series}'}, {'{year}'}, {'{format}'}</p>
        <input
          className="field"
          value={namingTemplate}
          onChange={e => setNamingTemplate(e.target.value)}
          placeholder="{author}/{title}"
        />
        <button className="btn-primary" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save
        </button>
      </section>
    </div>
  )
}

// ── Metadata Tab ─────────────────────────────────────────────────────────────

function MetadataTab() {
  const { addToast } = useToast()

  const DEFAULT_SOURCES = ['google_books', 'open_library', 'goodreads']

  const saveMutation = useMutation({
    mutationFn: (data: Record<string, string>) => api.saveSettings(data),
    onSuccess: () => addToast('success', 'Saved'),
    onError: (e: Error) => addToast('error', e.message),
  })

  const [priority, setPriority] = useState<string[]>(DEFAULT_SOURCES)
  const [disabled, setDisabled] = useState<Set<string>>(new Set())

  function toggleDisabled(source: string) {
    setDisabled(prev => {
      const next = new Set(prev)
      next.has(source) ? next.delete(source) : next.add(source)
      return next
    })
  }

  function moveUp(idx: number) {
    if (idx === 0) return
    const next = [...priority]
    ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
    setPriority(next)
  }

  function moveDown(idx: number) {
    if (idx === priority.length - 1) return
    const next = [...priority]
    ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
    setPriority(next)
  }

  function save() {
    saveMutation.mutate({
      source_priority: priority.join(','),
      sources_disabled: [...disabled].join(','),
    })
  }

  const sourceLabels: Record<string, string> = {
    google_books: 'Google Books',
    open_library: 'Open Library',
    goodreads: 'Goodreads',
  }

  return (
    <div className="space-y-4">
      <section className="card p-5 space-y-3">
        <h2 className="text-sm font-semibold text-ink">Source Priority</h2>
        <p className="text-xs text-ink-muted">Sources are tried in order. Drag or use arrows to reorder.</p>
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
      <button className="btn-primary" onClick={save} disabled={saveMutation.isPending}>
        {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Save
      </button>
    </div>
  )
}

// ── Account Tab ───────────────────────────────────────────────────────────────

function AccountTab() {
  const { addToast } = useToast()
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwError, setPwError] = useState('')

  const changeMutation = useMutation({
    mutationFn: () => api.changePassword(currentPw, newPw),
    onSuccess: () => {
      addToast('success', 'Password changed')
      setCurrentPw(''); setNewPw(''); setConfirmPw(''); setPwError('')
    },
    onError: (e: Error) => addToast('error', e.message),
  })

  function submit() {
    if (newPw.length < 8) { setPwError('Password must be at least 8 characters'); return }
    if (newPw !== confirmPw) { setPwError('Passwords do not match'); return }
    setPwError('')
    changeMutation.mutate()
  }

  return (
    <div className="space-y-6">
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
          <input
            className="field"
            type="password"
            value={confirmPw}
            onChange={e => setConfirmPw(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
          />
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
