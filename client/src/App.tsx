import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { CheckCircle, AlertCircle, X, Loader2 } from 'lucide-react';
import api from './api/client';
import { useStore } from './store';
import LoginPage from './pages/LoginPage';
import SetupPage from './pages/SetupPage';
import LibraryPage from './pages/LibraryPage';
import UploadPage from './pages/UploadPage';
import SettingsPage from './pages/SettingsPage';
import TopBar from './components/TopBar';

// ── Toast context ─────────────────────────────────────────────────────────

interface Toast {
  id: number;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface ToastCtx {
  addToast: (type: Toast['type'], message: string) => void;
}

export const ToastContext = createContext<ToastCtx>({ addToast: () => {} });
export const useToast = () => useContext(ToastContext);

let _toastId = 0;

function ToastList({ toasts, remove }: { toasts: Toast[]; remove: (id: number) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 w-80">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-start gap-3 px-4 py-3 rounded-lg shadow-lg border border-line bg-surface-raised text-ink text-sm ${
            t.type === 'error' ? 'border-danger/30' : t.type === 'success' ? 'border-success/30' : ''
          }`}
        >
          {t.type === 'success' && <CheckCircle className="w-4 h-4 text-success mt-0.5 shrink-0" />}
          {t.type === 'error' && <AlertCircle className="w-4 h-4 text-danger mt-0.5 shrink-0" />}
          {t.type === 'info' && <AlertCircle className="w-4 h-4 text-accent mt-0.5 shrink-0" />}
          <span className="flex-1">{t.message}</span>
          <button
            onClick={() => remove(t.id)}
            className="text-ink-muted hover:text-ink transition-colors shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────

type AuthState = 'loading' | 'first_run' | 'unauthenticated' | 'authenticated';

export default function App() {
  const { view, setUser } = useStore();
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((type: Toast['type'], message: string) => {
    const id = ++_toastId;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4500);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const checkAuth = useCallback(async () => {
    try {
      const status = await api.getAuthStatus();
      if (status.first_run) {
        setAuthState('first_run');
        setUser(null);
      } else if (status.authenticated && status.username) {
        setAuthState('authenticated');
        setUser({ id: 0, username: status.username, role: 'user' });
      } else {
        setAuthState('unauthenticated');
        setUser(null);
      }
    } catch {
      setAuthState('unauthenticated');
      setUser(null);
    }
  }, [setUser]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <ToastContext.Provider value={{ addToast }}>
      <div className="min-h-screen bg-surface text-ink font-sans">
        {authState === 'loading' && (
          <div className="flex items-center justify-center min-h-screen">
            <Loader2 className="w-8 h-8 text-accent animate-spin" />
          </div>
        )}

        {authState === 'first_run' && (
          <SetupPage onSuccess={checkAuth} />
        )}

        {authState === 'unauthenticated' && (
          <LoginPage onSuccess={checkAuth} />
        )}

        {authState === 'authenticated' && (
          <div className="flex flex-col min-h-screen">
            <TopBar onAuthChange={checkAuth} />
            <main className="flex-1">
              {view === 'library' && <LibraryPage />}
              {view === 'upload' && <UploadPage />}
              {view === 'settings' && <SettingsPage />}
            </main>
          </div>
        )}

        <ToastList toasts={toasts} remove={removeToast} />
      </div>
    </ToastContext.Provider>
  );
}
