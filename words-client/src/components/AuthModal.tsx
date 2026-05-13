import { useState } from 'react';
import { authApi, setToken } from '../api';
import type { User } from '../api';
import './AuthModal.css';

type AuthView = 'login' | 'register' | 'forgot' | 'verify-prompt';

interface Props {
  onClose: () => void;
  onAuth: (user: User, token: string) => void;
  initialView?: AuthView;
}

export default function AuthModal({ onClose, onAuth, initialView = 'login' }: Props) {
  const [view, setView] = useState<AuthView>(initialView);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const { token, user } = await authApi.login(email, password);
      setToken(token);
      onAuth(user, token);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await authApi.register(email, password, name || undefined);
      setView('verify-prompt');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await authApi.forgotPassword(email);
      setMessage('If that email exists, a reset link has been sent.');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setError(''); setLoading(true);
    try {
      await authApi.resendVerification(email);
      setMessage('Verification email resent.');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function switchView(v: AuthView) {
    setView(v);
    setError('');
    setMessage('');
  }

  return (
    <div className="auth-overlay" onClick={onClose}>
      <button className="auth-close" onClick={onClose}>✕</button>
      <div className="auth-modal" onClick={e => e.stopPropagation()}>
        <img src="/logo.png" className="auth-logo" alt="6/7 Words" />

        {view === 'login' && (
          <>
            <p className="auth-mode-title">Sign in</p>
            <form onSubmit={handleLogin}>
              <div className="form-group">
                <label htmlFor="email">Email</label>
                <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required autoFocus />
              </div>
              <div className="form-group">
                <label htmlFor="password">Password</label>
                <input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
              </div>
              {error && <div className="auth-error">{error}</div>}
              <button className="auth-submit" type="submit" disabled={loading}>{loading ? '…' : 'Sign In'}</button>
              <button type="button" className="auth-forgot" onClick={() => switchView('forgot')}>Forgot password?</button>
            </form>
            <div className="auth-switch">
              Don't have an account?{' '}
              <button onClick={() => switchView('register')}>Sign up</button>
            </div>
          </>
        )}

        {view === 'register' && (
          <>
            <p className="auth-mode-title">Create account</p>
            <form onSubmit={handleRegister}>
              <div className="form-group">
                <label htmlFor="name">Name (optional)</label>
                <input id="name" type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Your name" autoFocus />
              </div>
              <div className="form-group">
                <label htmlFor="email">Email</label>
                <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required />
              </div>
              <div className="form-group">
                <label htmlFor="password">Password</label>
                <input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
              </div>
              {error && <div className="auth-error">{error}</div>}
              <button className="auth-submit register" type="submit" disabled={loading}>{loading ? '…' : 'Register'}</button>
            </form>
            <div className="auth-switch">
              Already have an account?{' '}
              <button onClick={() => switchView('login')}>Sign in</button>
            </div>
          </>
        )}

        {view === 'forgot' && (
          <>
            <p className="auth-mode-title">Reset password</p>
            <form onSubmit={handleForgot}>
              <div className="form-group">
                <label htmlFor="email">Email</label>
                <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required autoFocus />
              </div>
              {error && <div className="auth-error">{error}</div>}
              {message && <div className="auth-message">{message}</div>}
              <button className="auth-submit" type="submit" disabled={loading}>{loading ? '…' : 'Send Reset Link'}</button>
            </form>
            <div className="auth-switch">
              Remember your password?{' '}
              <button onClick={() => switchView('login')}>Sign in</button>
            </div>
          </>
        )}

        {view === 'verify-prompt' && (
          <>
            <p className="auth-mode-title">Check your email</p>
            <p className="auth-info">We sent a verification link to <strong>{email}</strong>. Click it to activate your account.</p>
            {error && <div className="auth-error">{error}</div>}
            {message && <div className="auth-message">{message}</div>}
            <button className="auth-resend" onClick={handleResend} disabled={loading}>{loading ? '…' : 'Resend verification email'}</button>
            <div className="auth-switch">
              <button onClick={() => switchView('login')}>Back to Sign In</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
