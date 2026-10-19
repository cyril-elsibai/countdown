import { useState } from 'react';
import { authApi } from '../api';
import type { User } from '../api';

interface Props {
  user: User;
  onUserUpdate: (user: User) => void;
  onClose: () => void;
  onLogout: () => void;
}

export default function ProfileModal({ user, onUserUpdate, onClose, onLogout }: Props) {
  const [name, setName] = useState(user.name || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function handleUpdateName(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setMessage(''); setLoading(true);
    try {
      const { user: updated } = await authApi.updateProfile(name);
      onUserUpdate(updated);
      setMessage('Name updated');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setMessage('');
    if (newPassword.length < 6) { setError('Password must be at least 6 characters'); return; }
    setLoading(true);
    try {
      const { message: msg } = await authApi.changePassword(currentPassword, newPassword);
      setMessage(msg);
      setCurrentPassword('');
      setNewPassword('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="dark-overlay" onClick={onClose}>
      <div className="profile-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Profile</h2>
          <div className="modal-header-actions">
            <button className="icon-btn" onClick={onLogout} title="Log out" aria-label="Log out">
              <svg viewBox="0 0 24 24">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </button>
            <button className="icon-btn" onClick={onClose} aria-label="Close">
              <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>
            </button>
          </div>
        </div>

        <div className="modal-msg">
          {message && <p className="ok">{message}</p>}
          {error && <p className="err">{error}</p>}
        </div>

        <section className="modal-section">
          <h3>Display name</h3>
          <form onSubmit={handleUpdateName} className="inline-form">
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Your name" />
            <button type="submit" className="auth-submit" disabled={loading}>{loading ? '…' : 'Update'}</button>
          </form>
        </section>

        <section className="modal-section">
          <h3>Change password</h3>
          <form onSubmit={handleChangePassword}>
            <div className="form-group">
              <label>Current password</label>
              <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>New password</label>
              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={6} />
            </div>
            <button type="submit" className="auth-submit" disabled={loading}>{loading ? '…' : 'Change password'}</button>
          </form>
        </section>
      </div>
    </div>
  );
}
