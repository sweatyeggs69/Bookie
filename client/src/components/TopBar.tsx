import React, { useRef, useState } from 'react';
import {
  ArrowUpCircle,
  BookOpen,
  Check,
  ChevronDown,
  Loader2,
  LogOut,
  Monitor,
  Moon,
  RefreshCw,
  Settings,
  Sun,
  Upload,
  User,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import api from '../api/client';
import { useStore } from '../store';
import { useToast } from '../contexts/toast';
import SearchBar from './SearchBar';

interface Props {
  onAuthChange: () => void;
}

type ThemeMode = 'system' | 'light' | 'dark';

function applyTheme(mode: ThemeMode) {
  if (mode === 'light') {
    document.documentElement.dataset.theme = 'light';
  } else if (mode === 'dark') {
    document.documentElement.dataset.theme = '';
  } else {
    // system
    const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    document.documentElement.dataset.theme = prefersLight ? 'light' : '';
  }
}

export default function TopBar({ onAuthChange }: Props) {
  const { user, view, setView, setPage } = useStore();
  const { addToast } = useToast();
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.getSettings, staleTime: 60_000 });
  const { data: updateInfo } = useQuery({ queryKey: ['update-check'], queryFn: api.getUpdateInfo, staleTime: 3_600_000, retry: false });
  const displayName = (typeof settings?.display_name === 'string' && settings.display_name ? settings.display_name : null) || user?.username;
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    return (localStorage.getItem('theme') as ThemeMode) ?? 'system';
  });
  const menuRef = useRef<HTMLDivElement>(null);

  function setTheme(mode: ThemeMode) {
    setThemeMode(mode);
    localStorage.setItem('theme', mode);
    applyTheme(mode);
  }

  async function handleScan() {
    if (scanning) return;
    setUserMenuOpen(false);
    setScanning(true);
    try {
      const result = await api.scanLibrary();
      const parts: string[] = [];
      if (result.added) parts.push(`${result.added} ${result.added === 1 ? 'book' : 'books'} added`);
      if (result.removed) parts.push(`${result.removed} ${result.removed === 1 ? 'book' : 'books'} removed`);
      addToast('success', parts.length ? parts.join(', ') + '.' : 'Library up to date!');
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Scan failed');
    } finally {
      setScanning(false);
    }
  }

  async function handleLogout() {
    setUserMenuOpen(false);
    try {
      await api.logout();
    } finally {
      onAuthChange();
    }
  }

  function handleMenuBlur(e: React.FocusEvent<HTMLDivElement>) {
    if (!menuRef.current?.contains(e.relatedTarget as Node)) {
      setUserMenuOpen(false);
    }
  }

  const themeOptions: { mode: ThemeMode; label: string; Icon: typeof Sun }[] = [
    { mode: 'system', label: 'System', Icon: Monitor },
    { mode: 'light', label: 'Light', Icon: Sun },
    { mode: 'dark', label: 'Dark', Icon: Moon },
  ];

  return (
    <header className="relative sticky top-0 z-40 h-14 bg-surface-card border-b border-line flex items-center gap-3 px-4">
      {/* Brand — always visible */}
      <button
        onClick={() => { setView('library'); setPage(1); history.replaceState(null, '', window.location.pathname + window.location.search) }}
        className="flex items-center gap-2 shrink-0 text-ink hover:text-accent transition-colors"
      >
        <BookOpen className="w-5 h-5 text-accent" />
        <span className="font-semibold text-base tracking-tight">Bookie</span>
      </button>

      {/* Desktop search — absolutely centered in header */}
      <div className="hidden lg:flex absolute inset-x-0 justify-center pointer-events-none">
        <div className="w-full max-w-sm px-4 pointer-events-auto">
          <SearchBar />
        </div>
      </div>

      {/* Spacer on mobile/tablet */}
      <div className="flex-1 lg:hidden" />

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0 ml-auto">
        {/* Upload */}
        <button
          onClick={() => setView('upload')}
          title="Upload books"
          className={[
            'w-9 h-9 flex items-center justify-center rounded transition-colors',
            view === 'upload'
              ? 'text-accent bg-accent-muted'
              : 'text-ink-muted hover:text-ink hover:bg-surface-raised',
          ].join(' ')}
        >
          <Upload className="w-4 h-4" />
        </button>

        {/* User menu */}
        <div
          className="relative"
          ref={menuRef}
          onBlur={handleMenuBlur}
          tabIndex={-1}
        >
          <button
            onClick={() => setUserMenuOpen((o) => !o)}
            className={[
              "relative flex items-center gap-1.5 h-9 pl-2 pr-1.5 rounded text-ink-muted hover:text-ink hover:bg-surface-raised transition-colors",
              updateInfo?.update_available ? "update-glow" : "",
            ].join(' ')}
          >
            <User className="w-4 h-4" />
            <span className="hidden sm:block text-sm max-w-[120px] truncate">{displayName}</span>
            <ChevronDown className="w-3.5 h-3.5" />
          </button>

          {userMenuOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-52 bg-surface-raised border border-line rounded-lg shadow-xl py-1 z-50">
              <div className="px-3 py-2 border-b border-line">
                <p className="text-xs text-ink-muted">Signed in as</p>
                <p className="text-sm font-medium text-ink truncate">{displayName}</p>
                {typeof settings?.display_name === 'string' && settings.display_name && !!user?.username && settings.display_name !== user.username && (
                  <p className="text-xs text-ink-faint truncate">{user.username}</p>
                )}
              </div>

              <button
                onClick={() => { setUserMenuOpen(false); setView('settings'); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-ink hover:bg-surface-high transition-colors"
              >
                <Settings className="w-3.5 h-3.5 text-ink-muted" />
                Settings
              </button>

              <button
                onClick={handleScan}
                disabled={scanning}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-ink hover:bg-surface-high transition-colors disabled:opacity-50"
              >
                {scanning
                  ? <Loader2 className="w-3.5 h-3.5 text-ink-muted animate-spin" />
                  : <RefreshCw className="w-3.5 h-3.5 text-ink-muted" />}
                Refresh library
              </button>

              {/* Appearance */}
              <div className="border-t border-line mt-1 pt-1">
                <p className="px-3 py-1 text-[11px] font-medium text-ink-faint uppercase tracking-wide">Appearance</p>
                {themeOptions.map(({ mode, label, Icon }) => (
                  <button
                    key={mode}
                    onClick={() => setTheme(mode)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-ink hover:bg-surface-high transition-colors"
                  >
                    <Icon className="w-3.5 h-3.5 text-ink-muted" />
                    <span className="flex-1 text-left">{label}</span>
                    {themeMode === mode && <Check className="w-3.5 h-3.5 text-accent" />}
                  </button>
                ))}
              </div>

              {updateInfo?.update_available && (
                <div className="border-t border-line mt-1 pt-1">
                  <div className="flex items-center gap-2.5 px-3 py-2">
                    <ArrowUpCircle className="w-3.5 h-3.5 shrink-0 text-accent" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-accent">Update available</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="border-t border-line mt-1 pt-1">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-danger hover:bg-danger/10 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
