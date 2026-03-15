import { useState } from 'react';
import { authApi } from '../api';
import type { User } from '../api';
import './ProfileModal.css';

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
    <div className="modal-overlay" onClick={onClose}>
      <div className="profile-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Profile</h2>
          <div className="modal-header-actions">
            <button className="logout-btn" onClick={onLogout} title="Sign out">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </button>
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>
        </div>

        <div style={{ minHeight: 24 }}>
          {message && <p className="modal-message">{message}</p>}
          {error && <p className="modal-error">{error}</p>}
        </div>

        <section className="modal-section">
          <h3>Display Name</h3>
          <form onSubmit={handleUpdateName} className="inline-form">
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Your name" />
            <button type="submit" className="inline-btn" disabled={loading}>{loading ? '…' : 'Update'}</button>
          </form>
        </section>

        <section className="modal-section">
          <h3>Change Password</h3>
          <form onSubmit={handleChangePassword}>
            <div className="form-field">
              <label>Current Password</label>
              <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required />
            </div>
            <div className="form-field">
              <label>New Password</label>
              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={6} />
            </div>
            <button type="submit" className="block-btn" disabled={loading}>{loading ? '…' : 'Change Password'}</button>
          </form>
        </section>
      </div>
    </div>
  );
}
