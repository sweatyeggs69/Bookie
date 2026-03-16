import React, { useRef, useState } from 'react';
import {
  BookOpen,
  ChevronDown,
  Key,
  Loader2,
  LogOut,
  RefreshCw,
  Settings,
  Upload,
  User,
} from 'lucide-react';
import api from '../api/client';
import { useStore } from '../store';
import SearchBar from './SearchBar';
import { useToast } from '../App';

interface Props {
  onAuthChange: () => void;
}

export default function TopBar({ onAuthChange }: Props) {
  const { user, setView } = useStore();
  const { addToast } = useToast();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  async function handleScan() {
    if (scanning) return;
    setScanning(true);
    try {
      const result = await api.scanLibrary();
      addToast(
        'success',
        `Library scanned — ${result.added} added, ${result.updated} updated, ${result.removed} removed.`
      );
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

  // Close menu on outside click
  function handleMenuBlur(e: React.FocusEvent<HTMLDivElement>) {
    if (!menuRef.current?.contains(e.relatedTarget as Node)) {
      setUserMenuOpen(false);
    }
  }

  return (
    <header className="sticky top-0 z-40 h-14 bg-surface-card border-b border-line flex items-center gap-3 px-4">
      {/* Brand */}
      <button
        onClick={() => setView('library')}
        className="flex items-center gap-2 shrink-0 text-ink hover:text-accent transition-colors"
      >
        <BookOpen className="w-5 h-5 text-accent" />
        <span className="font-semibold text-base tracking-tight hidden sm:block">Bookie</span>
      </button>

      {/* Search — grows to fill space */}
      <div className="flex-1 flex justify-center px-2">
        <SearchBar />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        {/* Scan */}
        <button
          onClick={handleScan}
          disabled={scanning}
          title="Refresh library"
          className="w-9 h-9 flex items-center justify-center rounded text-ink-muted hover:text-ink hover:bg-surface-raised disabled:opacity-50 transition-colors"
        >
          {scanning ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
        </button>

        {/* Upload */}
        <button
          onClick={() => setView('upload')}
          title="Upload books"
          className="w-9 h-9 flex items-center justify-center rounded text-ink-muted hover:text-ink hover:bg-surface-raised transition-colors"
        >
          <Upload className="w-4 h-4" />
        </button>

        {/* Settings */}
        <button
          onClick={() => setView('settings')}
          title="Settings"
          className="w-9 h-9 flex items-center justify-center rounded text-ink-muted hover:text-ink hover:bg-surface-raised transition-colors"
        >
          <Settings className="w-4 h-4" />
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
            className="flex items-center gap-1.5 h-9 pl-2 pr-1.5 rounded text-ink-muted hover:text-ink hover:bg-surface-raised transition-colors"
          >
            <User className="w-4 h-4" />
            <span className="hidden sm:block text-sm max-w-[120px] truncate">{user?.username}</span>
            <ChevronDown className="w-3.5 h-3.5" />
          </button>

          {userMenuOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-44 bg-surface-raised border border-line rounded-lg shadow-xl py-1 z-50">
              <div className="px-3 py-2 border-b border-line">
                <p className="text-xs text-ink-muted">Signed in as</p>
                <p className="text-sm font-medium text-ink truncate">{user?.username}</p>
              </div>

              <button
                onClick={() => {
                  setUserMenuOpen(false);
                  setView('settings');
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-ink hover:bg-surface-high transition-colors"
              >
                <Key className="w-3.5 h-3.5 text-ink-muted" />
                Change password
              </button>

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
