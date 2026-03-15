import { useState } from 'react';
import { authApi, setToken } from '../api';
import type { User } from '../api';
import './AuthModal.css';

type AuthView = 'login' | 'register' | 'forgot' | 'verify-prompt';

interface Props {
  onClose: () => void;
  onAuth: (user: User, token: string) => void;
}

export default function AuthModal({ onClose, onAuth }: Props) {
  const [view, setView] = useState<AuthView>('login');
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
      await authApi.register(email, password, name);
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

  return (
    <div className="auth-overlay" onClick={onClose}>
      <div className="auth-modal" onClick={e => e.stopPropagation()}>
        <button className="auth-close" onClick={onClose}>✕</button>

        {view === 'login' && (
          <>
            <h2>Sign In</h2>
            <form onSubmit={handleLogin}>
              <div className="auth-field">
                <label>Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
              </div>
              <div className="auth-field">
                <label>Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
              </div>
              <div className="auth-error-wrap"><div style={{ minHeight: 20 }}>{error && <p className="auth-error">{error}</p>}</div></div>
              <button className="auth-btn primary" type="submit" disabled={loading}>{loading ? '…' : 'Sign In'}</button>
            </form>
            <div className="auth-links">
              <button onClick={() => { setView('forgot'); setError(''); }}>Forgot password?</button>
              <button onClick={() => { setView('register'); setError(''); }}>Create account</button>
            </div>
          </>
        )}

        {view === 'register' && (
          <>
            <h2>Create Account</h2>
            <form onSubmit={handleRegister}>
              <div className="auth-field">
                <label>Name</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} required autoFocus />
              </div>
              <div className="auth-field">
                <label>Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
              </div>
              <div className="auth-field">
                <label>Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
              </div>
              <div className="auth-error-wrap"><div style={{ minHeight: 20 }}>{error && <p className="auth-error">{error}</p>}</div></div>
              <button className="auth-btn primary" type="submit" disabled={loading}>{loading ? '…' : 'Create Account'}</button>
            </form>
            <div className="auth-links">
              <button onClick={() => { setView('login'); setError(''); }}>Already have an account?</button>
            </div>
          </>
        )}

        {view === 'forgot' && (
          <>
            <h2>Reset Password</h2>
            <form onSubmit={handleForgot}>
              <div className="auth-field">
                <label>Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
              </div>
              <div className="auth-error-wrap"><div style={{ minHeight: 20 }}>{error && <p className="auth-error">{error}</p>}{message && <p className="auth-message">{message}</p>}</div></div>
              <button className="auth-btn primary" type="submit" disabled={loading}>{loading ? '…' : 'Send Reset Link'}</button>
            </form>
            <div className="auth-links">
              <button onClick={() => { setView('login'); setError(''); setMessage(''); }}>Back to Sign In</button>
            </div>
          </>
        )}

        {view === 'verify-prompt' && (
          <>
            <h2>Check Your Email</h2>
            <p className="auth-info">We sent a verification link to <strong>{email}</strong>. Click it to activate your account.</p>
            <div className="auth-error-wrap"><div style={{ minHeight: 20 }}>{error && <p className="auth-error">{error}</p>}{message && <p className="auth-message">{message}</p>}</div></div>
            <button className="auth-btn secondary" onClick={handleResend} disabled={loading}>{loading ? '…' : 'Resend Email'}</button>
            <div className="auth-links">
              <button onClick={() => { setView('login'); setError(''); setMessage(''); }}>Back to Sign In</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
