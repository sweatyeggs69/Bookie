import React, { FormEvent, useState } from 'react';
import { BookOpen, Loader2 } from 'lucide-react';

interface Props {
  onSuccess: () => void;
}

export default function SetupPage({ onSuccess }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!username.trim()) {
      setError('Username is required.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/setup', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? body.message ?? `HTTP ${res.status}`);
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-accent/20 flex items-center justify-center mb-4">
            <BookOpen className="w-7 h-7 text-accent" />
          </div>
          <h1 className="text-2xl font-semibold text-ink tracking-tight">Bookie</h1>
          <p className="text-ink-muted text-sm mt-1">Create your admin account to get started</p>
        </div>

        {/* Card */}
        <div className="bg-surface-card border border-line rounded-xl p-6">
          <div className="mb-5 px-3 py-2.5 rounded bg-accent/10 border border-accent/20 text-accent text-sm">
            First-run setup — create the administrator account.
          </div>

          <form onSubmit={handleSubmit} noValidate>
            {error && (
              <div className="mb-4 px-3 py-2.5 rounded bg-danger/10 border border-danger/20 text-danger text-sm">
                {error}
              </div>
            )}

            {/* Username */}
            <div className="mb-4">
              <label htmlFor="su-username" className="block text-sm font-medium text-ink mb-1.5">
                Username
              </label>
              <input
                id="su-username"
                type="text"
                autoComplete="username"
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-surface-raised border border-line rounded px-3 py-2 text-ink placeholder-ink-muted text-sm focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30 transition-colors"
                placeholder="Choose a username"
                disabled={loading}
              />
            </div>

            {/* Password */}
            <div className="mb-4">
              <label htmlFor="su-password" className="block text-sm font-medium text-ink mb-1.5">
                Password
              </label>
              <input
                id="su-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-surface-raised border border-line rounded px-3 py-2 text-ink placeholder-ink-muted text-sm focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30 transition-colors"
                placeholder="At least 6 characters"
                disabled={loading}
              />
            </div>

            {/* Confirm password */}
            <div className="mb-6">
              <label htmlFor="su-confirm" className="block text-sm font-medium text-ink mb-1.5">
                Confirm password
              </label>
              <input
                id="su-confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full bg-surface-raised border border-line rounded px-3 py-2 text-ink placeholder-ink-muted text-sm focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30 transition-colors"
                placeholder="Repeat your password"
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm py-2.5 rounded transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating account…
                </>
              ) : (
                'Create account'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
