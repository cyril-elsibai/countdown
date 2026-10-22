import { useState } from 'react';
import { authApi, setToken } from '../api';

interface AuthFormProps {
  onSuccess: (user: { id: string; email: string; name?: string }) => void;
  onCancel: () => void;
  initialMode?: 'login' | 'register';
}

export default function AuthForm({ onSuccess, onCancel, initialMode = 'login' }: AuthFormProps) {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [showResend, setShowResend] = useState(false);
  // After register / forgot, the form is replaced by a "check your inbox" screen
  const [sent, setSent] = useState<null | 'register' | 'forgot'>(null);
  const [resent, setResent] = useState(false);

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
        await authApi.register(email, password, name || undefined);
        // Don't call onSuccess - user needs to verify email first
        setSent('register');
        setResent(false);
      } else if (mode === 'forgot') {
        await authApi.forgotPassword(email);
        setSent('forgot');
        setResent(false);
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
      setMessage(response.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend');
    } finally {
      setLoading(false);
    }
  };

  const handleSendAgain = async () => {
    setError('');
    setLoading(true);
    try {
      if (sent === 'register') await authApi.resendVerification(email);
      else await authApi.forgotPassword(email);
      setResent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend');
    } finally {
      setLoading(false);
    }
  };

  const goToSignIn = () => {
    setSent(null);
    setMode('login');
    setPassword('');
    setError('');
    setMessage('');
    setShowResend(false);
  };

  const startOver = () => {
    setSent(null);
    setError('');
    setMessage('');
  };

  if (sent) {
    return (
      <div className="auth-overlay">
        <button className="auth-close" onClick={onCancel}>&times;</button>
        <div className="auth-modal">
          <div className="auth-sent-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 6l8.5 7 8.5-7"/></svg>
          </div>
          <p className="auth-mode-title">Check your inbox</p>
          <p className="auth-sent-text">
            {sent === 'register' ? 'We sent a confirmation link to' : 'If an account exists, we sent a reset link to'}
            <strong className="auth-sent-email">{email}</strong>
            {sent === 'register'
              ? 'Click it to activate the account, then come back to sign in.'
              : 'Click it to choose a new password.'}
          </p>

          {error && <div className="auth-error">{error}</div>}

          <button type="button" className="auth-submit" onClick={goToSignIn}>
            Go to sign in
          </button>

          <div className="auth-switch">
            {resent ? (
              'Sent again. Check your spam folder too.'
            ) : (
              <>
                Didn't get it?{' '}
                <button onClick={handleSendAgain} disabled={loading}>
                  {loading ? 'Sending...' : 'Resend email'}
                </button>
              </>
            )}
          </div>
          <div className="auth-switch auth-switch-tight">
            Wrong address?{' '}
            <button onClick={startOver}>Start over</button>
          </div>
        </div>
      </div>
    );
  }

  const getSubmitText = () => {
    if (loading) return 'Please wait...';
    if (mode === 'login') return 'Sign In';
    if (mode === 'register') return 'Register';
    return 'Send Reset Link';
  };

  const getModeTitle = () => {
    if (mode === 'login') return 'Sign in';
    if (mode === 'register') return 'Create account';
    return 'Reset password';
  };

  return (
    <div className="auth-overlay">
      <button className="auth-close" onClick={onCancel}>&times;</button>
      <div className="auth-modal">
        <div className="auth-logo" aria-hidden="true">6/7</div>
        <p className="auth-mode-title">{getModeTitle()}</p>

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

          <button type="submit" className={`auth-submit${mode === 'register' ? ' register' : ''}`} disabled={loading}>
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
