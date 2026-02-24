import { useState } from 'react';
import { authApi, setToken } from '../api';

interface AuthFormProps {
  onSuccess: (user: { id: string; email: string; name?: string }) => void;
  onCancel: () => void;
}

export default function AuthForm({ onSuccess, onCancel }: AuthFormProps) {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [showResend, setShowResend] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError('');
    setMessage('');
    setLoading(true);

    try {
      if (mode === 'login') {
        const response = await authApi.login(email, password);
        setToken(response.token);
        onSuccess(response.user);
      } else if (mode === 'register') {
        const response = await authApi.register(email, password, name || undefined);
        setMessage(response.message);
        setShowResend(true);
        // Don't call onSuccess - user needs to verify email first
      } else if (mode === 'forgot') {
        const response = await authApi.forgotPassword(email);
        setMessage(response.message + ' Check the server console for the reset link.');
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Something went wrong';
      setError(errorMessage);

      // Check if this is a "needs verification" error from login
      if (errorMessage.includes('verify your email')) {
        setShowResend(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    setError('');
    setLoading(true);
    try {
      const response = await authApi.resendVerification(email);
      setMessage(response.message + ' Check the server console for the verification link.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend');
    } finally {
      setLoading(false);
    }
  };

  const getTitle = () => {
    if (mode === 'login') return 'Sign In';
    if (mode === 'register') return 'Create Account';
    return 'Reset Password';
  };

  const getSubmitText = () => {
    if (loading) return 'Please wait...';
    if (mode === 'login') return 'Sign In';
    if (mode === 'register') return 'Create Account';
    return 'Send Reset Link';
  };

  return (
    <div className="auth-overlay">
      <div className="auth-modal">
        <button className="auth-close" onClick={onCancel}>&times;</button>

        <h1 className="auth-title">6-7 Numbers</h1>
        <h2>{getTitle()}</h2>

        {message && <div className="auth-message">{message}</div>}

        <form onSubmit={handleSubmit}>
          {mode === 'register' && (
            <div className="form-group">
              <label htmlFor="name">Name (optional)</label>
              <input
                type="text"
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
              />
            </div>
          )}

          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>

          {mode !== 'forgot' && (
            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>
          )}

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="auth-submit" disabled={loading}>
            {getSubmitText()}
          </button>

          {mode === 'login' && (
            <button
              type="button"
              className="auth-forgot"
              onClick={() => { setMode('forgot'); setError(''); setMessage(''); }}
            >
              Forgot password?
            </button>
          )}
        </form>

        {showResend && (
          <button
            className="auth-resend"
            onClick={handleResendVerification}
            disabled={loading || !email}
          >
            Resend verification email
          </button>
        )}

        <div className="auth-switch">
          {mode === 'login' && (
            <>
              Don't have an account?{' '}
              <button onClick={() => { setMode('register'); setError(''); setMessage(''); setShowResend(false); }}>
                Sign up
              </button>
            </>
          )}
          {mode === 'register' && (
            <>
              Already have an account?{' '}
              <button onClick={() => { setMode('login'); setError(''); setMessage(''); setShowResend(false); }}>
                Sign in
              </button>
            </>
          )}
          {mode === 'forgot' && (
            <>
              Remember your password?{' '}
              <button onClick={() => { setMode('login'); setError(''); setMessage(''); }}>
                Sign in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
