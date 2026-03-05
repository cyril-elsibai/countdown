import { useState } from 'react';
import { authApi } from '../api';

interface ResetPasswordFormProps {
  token: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function ResetPasswordForm({ token, onSuccess, onCancel }: ResetPasswordFormProps) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      const response = await authApi.resetPassword(token, newPassword);
      setMessage(response.message);
      // Wait a moment then trigger success
      setTimeout(() => {
        onSuccess();
      }, 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-overlay">
      <div className="auth-modal">
        <button className="auth-close" onClick={onCancel}>&times;</button>

        <h1 className="auth-title">6/7 Numbers</h1>
        <h2>Set New Password</h2>

        {message && <div className="auth-message">{message}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="newPassword">New Password</label>
            <input
              type="password"
              id="newPassword"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password"
              required
              minLength={6}
              disabled={!!message}
            />
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <input
              type="password"
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              required
              minLength={6}
              disabled={!!message}
            />
          </div>

          {error && <div className="auth-error">{error}</div>}

          {!message && (
            <button type="submit" className="auth-submit" disabled={loading}>
              {loading ? 'Please wait...' : 'Reset Password'}
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
