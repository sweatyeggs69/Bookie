import React, { FormEvent, useState } from 'react';
import { BookOpen, Loader2 } from 'lucide-react';
import api from '../api/client';

interface Props {
  onSuccess: () => void;
}

export default function LoginPage({ onSuccess }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setError('');
    setLoading(true);
    try {
      await api.login(username.trim(), password);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
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
          <p className="text-ink-muted text-sm mt-1">Sign in to your library</p>
        </div>

        {/* Card */}
        <div className="bg-surface-card border border-line rounded-xl p-6">
          <form onSubmit={handleSubmit} noValidate>
            {/* Error */}
            {error && (
              <div className="mb-4 px-3 py-2.5 rounded bg-danger/10 border border-danger/20 text-danger text-sm">
                {error}
              </div>
            )}

            {/* Username */}
            <div className="mb-4">
              <label htmlFor="username" className="block text-sm font-medium text-ink mb-1.5">
                Username
              </label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-surface-raised border border-line rounded px-3 py-2 text-ink placeholder-ink-muted text-sm focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30 transition-colors"
                placeholder="Enter your username"
                disabled={loading}
              />
            </div>

            {/* Password */}
            <div className="mb-6">
              <label htmlFor="password" className="block text-sm font-medium text-ink mb-1.5">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-surface-raised border border-line rounded px-3 py-2 text-ink placeholder-ink-muted text-sm focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30 transition-colors"
                placeholder="Enter your password"
                disabled={loading}
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !username.trim() || !password}
              className="w-full bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm py-2.5 rounded transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
