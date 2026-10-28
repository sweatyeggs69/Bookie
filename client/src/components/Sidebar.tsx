import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowUpCircle,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Library,
  Loader2,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Palette,
  RefreshCw,
  Settings,
  Sun,
  Upload,
  X,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import api from '../api/client';
import { useStore } from '../store';
import { useToast } from '../contexts/toast';
import {
  ACCENTS,
  type AccentColor,
  type ThemeMode,
  getAccent,
  getThemeMode,
  setAccent as saveAccent,
  setThemeMode as saveThemeMode,
} from '../theme';

interface Props {
  onAuthChange: () => void;
}

export const SETTINGS_SECTIONS = [
  { id: 'library',  label: 'Library' },
  { id: 'metadata', label: 'Metadata' },
  { id: 'email',    label: 'Email / SMTP' },
  { id: 'account',  label: 'Account' },
  { id: 'logs',     label: 'Logs' },
] as const;

const THEME_ORDER: ThemeMode[] = ['system', 'light', 'dark'];
const THEME_META: Record<ThemeMode, { label: string; Icon: typeof Sun }> = {
  system: { label: 'System theme', Icon: Monitor },
  light:  { label: 'Light theme',  Icon: Sun },
  dark:   { label: 'Dark theme',   Icon: Moon },
};

function useHash() {
  const [hash, setHash] = useState(() => window.location.hash.replace('#', ''));
  useEffect(() => {
    const onChange = () => setHash(window.location.hash.replace('#', ''));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash;
}

// ── Small building blocks ────────────────────────────────────────────────────

const iconBtn =
  'w-8 h-8 flex items-center justify-center rounded-lg text-ink-faint hover:text-ink hover:bg-surface-hover transition-colors';

function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>(getThemeMode);
  const { label, Icon } = THEME_META[mode];
  const next = () => {
    const m = THEME_ORDER[(THEME_ORDER.indexOf(mode) + 1) % THEME_ORDER.length];
    setMode(m);
    saveThemeMode(m);
  };
  return (
    <button type="button" onClick={next} className={iconBtn} title={`${label} (click to change)`} aria-label={label}>
      <Icon className="w-4 h-4" />
    </button>
  );
}

function AccentPicker() {
  const [open, setOpen] = useState(false);
  const [accent, setAccentState] = useState<AccentColor>(getAccent);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={iconBtn}
        title="Accent color"
        aria-label="Accent color"
        aria-expanded={open}
      >
        <Palette className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 p-2 bg-surface-card border border-line rounded-xl shadow-xl book-menu-pop flex gap-1.5">
          {(Object.keys(ACCENTS) as AccentColor[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => { setAccentState(key); saveAccent(key); setOpen(false); }}
              title={ACCENTS[key].label}
              aria-label={ACCENTS[key].label}
              className={[
                'w-6 h-6 rounded-full transition-transform hover:scale-110',
                accent === key ? 'ring-2 ring-offset-2 ring-offset-surface-card ring-ink-muted' : '',
              ].join(' ')}
              style={{ backgroundColor: ACCENTS[key].swatch }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <BookOpen className="w-5 h-5 text-accent shrink-0" />
      <span className="text-xl font-bold tracking-tight text-ink">bookie</span>
    </div>
  );
}

interface NavItemProps {
  label: string;
  icon?: typeof Sun;
  active?: boolean;
  onClick: () => void;
  sub?: boolean;
  danger?: boolean;
  busy?: boolean;
  disabled?: boolean;
}

function NavItem({ label, icon: Icon, active, onClick, sub, danger, busy, disabled }: NavItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-current={active ? 'page' : undefined}
      className={[
        'w-full flex items-center gap-2 rounded-lg py-1.5 pl-3 pr-2 text-sm font-semibold text-left transition-colors disabled:opacity-60',
        sub
          ? active
            ? 'bg-surface-hover text-ink'
            : danger
              ? 'text-ink-muted hover:bg-danger/10 hover:text-danger'
              : 'text-ink-muted hover:bg-surface-hover hover:text-ink'
          : active
            ? 'bg-surface-hover text-ink'
            : 'text-ink/80 hover:bg-surface-hover hover:text-ink',
      ].join(' ')}
    >
      {Icon && (busy
        ? <Loader2 className={`${sub ? 'w-3.5 h-3.5' : 'w-4 h-4'} shrink-0 animate-spin`} />
        : <Icon className={`${sub ? 'w-3.5 h-3.5' : 'w-4 h-4'} shrink-0`} />)}
      <span className="flex-1 truncate">{label}</span>
    </button>
  );
}

/** A nav group: header item plus indented children behind a vertical rule */
function NavGroup({ children, header }: { header: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mb-4">
      {header}
      {children && (
        <div className="mt-1.5 grid grid-cols-[auto_1fr]">
          <div className="flex justify-center px-5">
            <div className="w-0.5 rounded-full bg-line" />
          </div>
          <div className="-ml-3 flex flex-col gap-0.5">{children}</div>
        </div>
      )}
    </div>
  );
}

// ── Sidebar ──────────────────────────────────────────────────────────────────

export default function Sidebar({ onAuthChange }: Props) {
  const { view, setView, setPage, sidebarCollapsed, setSidebarCollapsed } = useStore();
  const { addToast } = useToast();
  const hash = useHash();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scanning, setScanning] = useState(false);

  const { data: updateInfo } = useQuery({ queryKey: ['update-check'], queryFn: api.getUpdateInfo, staleTime: 3_600_000, retry: false });

  // Ctrl/Cmd+B toggles the desktop sidebar, like Profilarr
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b' && window.innerWidth >= 1024) {
        e.preventDefault();
        setSidebarCollapsed(!useStore.getState().sidebarCollapsed);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setSidebarCollapsed]);

  function go(fn: () => void) {
    fn();
    setMobileOpen(false);
  }

  function goLibrary() {
    go(() => {
      setView('library');
      setPage(1);
      history.replaceState(null, '', window.location.pathname + window.location.search);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
  }

  function goSettings(section?: string) {
    go(() => {
      setView('settings');
      window.location.hash = section ?? (SETTINGS_SECTIONS.some((s) => s.id === hash) ? hash : 'library');
    });
  }

  async function handleScan() {
    if (scanning) return;
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
    setMobileOpen(false);
    try {
      await api.logout();
    } finally {
      onAuthChange();
    }
  }

  const navLinks = (
    <>
      <NavGroup
        header={<NavItem label="Library" icon={Library} active={view === 'library'} onClick={goLibrary} />}
      >
        <NavItem sub label="Refresh library" icon={RefreshCw} busy={scanning} disabled={scanning} onClick={handleScan} />
      </NavGroup>

      <NavGroup
        header={<NavItem label="Upload" icon={Upload} active={view === 'upload'} onClick={() => go(() => setView('upload'))} />}
      />

      <NavGroup
        header={<NavItem label="Settings" icon={Settings} active={false} onClick={() => goSettings()} />}
      >
        {SETTINGS_SECTIONS.map((s) => (
          <NavItem
            key={s.id}
            sub
            label={s.label}
            active={view === 'settings' && hash === s.id}
            onClick={() => goSettings(s.id)}
          />
        ))}
        <NavItem sub danger label="Sign out" icon={LogOut} onClick={handleLogout} />
      </NavGroup>
    </>
  );

  const railItems: { label: string; icon: typeof Sun; active: boolean; onClick: () => void }[] = [
    { label: 'Library', icon: Library, active: view === 'library', onClick: goLibrary },
    { label: 'Upload', icon: Upload, active: view === 'upload', onClick: () => setView('upload') },
    { label: 'Settings', icon: Settings, active: view === 'settings', onClick: () => goSettings() },
  ];

  return (
    <>
      {/* ── Mobile top bar ─────────────────────────────────────────────── */}
      <header className="lg:hidden sticky top-0 z-40 h-14 flex items-center justify-between gap-3 px-4 bg-surface border-b border-line">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setMobileOpen(true)} className={iconBtn} aria-label="Open menu">
            <Menu className="w-5 h-5" />
          </button>
          <button type="button" onClick={goLibrary} aria-label="Library">
            <Brand />
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setView('upload')}
            className={iconBtn}
            title="Upload books"
            aria-label="Upload books"
          >
            <Upload className="w-4 h-4" />
          </button>
          <AccentPicker />
          <ThemeToggle />
        </div>
      </header>

      {/* ── Mobile drawer backdrop ─────────────────────────────────────── */}
      {mobileOpen && (
        <button
          type="button"
          className="lg:hidden fixed inset-0 z-[44] bg-black/50 dialog-scrim"
          onClick={() => setMobileOpen(false)}
          aria-label="Close menu"
        />
      )}

      {/* ── Sidebar (drawer on mobile, fixed column on desktop) ────────── */}
      <nav
        aria-label="Sidebar"
        className={[
          'fixed top-0 left-0 z-[45] h-full w-72 max-w-[85vw] flex flex-col bg-surface border-r border-line',
          'transition-transform duration-200 ease-in-out',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          sidebarCollapsed ? 'lg:-translate-x-full' : 'lg:translate-x-0',
        ].join(' ')}
      >
        <div className="h-16 shrink-0 flex items-center justify-between gap-2 pl-7 pr-4">
          <button type="button" onClick={goLibrary} aria-label="Library">
            <Brand />
          </button>
          <div className="flex items-center gap-0.5">
            {updateInfo?.update_available && (
              <span
                className="w-8 h-8 flex items-center justify-center rounded-lg text-success update-glow"
                title={`Update available${updateInfo.latest_build ? `: ${updateInfo.latest_build}` : ''}`}
              >
                <ArrowUpCircle className="w-4 h-4" />
              </span>
            )}
            <span className="hidden lg:contents">
              <AccentPicker />
              <ThemeToggle />
            </span>
            <button
              type="button"
              onClick={() => setSidebarCollapsed(true)}
              className={`${iconBtn} hidden lg:flex`}
              title="Collapse sidebar (Ctrl+B)"
              aria-label="Collapse sidebar"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => setMobileOpen(false)} className={`${iconBtn} lg:hidden`} aria-label="Close menu">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pt-2 pb-4">{navLinks}</div>
      </nav>

      {/* ── Desktop collapsed icon rail ────────────────────────────────── */}
      <nav
        aria-label="Sidebar (collapsed)"
        className={[
          'hidden lg:flex fixed top-0 left-0 z-[45] h-full w-14 flex-col items-center bg-surface border-r border-line',
          'transition-opacity duration-150',
          sidebarCollapsed ? 'opacity-100' : 'opacity-0 pointer-events-none',
        ].join(' ')}
      >
        <button
          type="button"
          onClick={() => setSidebarCollapsed(false)}
          className={`${iconBtn} mt-4 w-9 h-9 rounded-xl`}
          title="Expand sidebar (Ctrl+B)"
          aria-label="Expand sidebar"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <div className="flex-1 flex flex-col items-center justify-center gap-2">
          {railItems.map(({ label, icon: Icon, active, onClick }) => (
            <button
              key={label}
              type="button"
              onClick={onClick}
              title={label}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              className={[
                'w-9 h-9 flex items-center justify-center rounded-xl border transition-colors',
                active
                  ? 'border-line bg-surface-hover text-ink'
                  : 'border-transparent text-ink-faint hover:bg-surface-hover hover:text-ink',
              ].join(' ')}
            >
              <Icon className="w-4 h-4" />
            </button>
          ))}
        </div>
        <div className="mb-4 flex flex-col items-center gap-2">
          {updateInfo?.update_available && (
            <span className="w-9 h-9 flex items-center justify-center rounded-xl border border-line text-success update-glow" title="Update available">
              <ArrowUpCircle className="w-4 h-4" />
            </span>
          )}
          <button type="button" onClick={goLibrary} className="p-1 rounded-md hover:bg-surface-hover" aria-label="Library">
            <BookOpen className="w-5 h-5 text-accent" />
          </button>
        </div>
      </nav>
    </>
  );
}
