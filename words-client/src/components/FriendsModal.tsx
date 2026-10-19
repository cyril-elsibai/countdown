import { useState, useEffect } from 'react';
import { friendsApi } from '../api';
import type { Friend } from '../api';

interface Props {
  onClose: () => void;
}

export default function FriendsModal({ onClose }: Props) {
  const [friendEmail, setFriendEmail] = useState('');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(false);
  const [friendsLoading, setFriendsLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    loadFriends();
    const interval = setInterval(loadFriends, 30000);
    return () => clearInterval(interval);
  }, []);

  async function loadFriends() {
    try {
      const { friends } = await friendsApi.list();
      setFriends(friends);
    } catch { /* silent */ } finally {
      setFriendsLoading(false);
    }
  }

  async function handleSendRequest(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setMessage('');
    if (!friendEmail.trim()) return;
    setLoading(true);
    try {
      const { friend } = await friendsApi.sendRequest(friendEmail.trim());
      setFriends(prev => [...prev, friend]);
      setFriendEmail('');
      setMessage('Friend request sent');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAccept(id: string) {
    try {
      const { friend } = await friendsApi.acceptRequest(id);
      setFriends(prev => prev.map(f => f.id === id ? friend : f));
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleRemove(id: string) {
    try {
      await friendsApi.remove(id);
      setFriends(prev => prev.filter(f => f.id !== id));
    } catch (err: any) {
      setError(err.message);
    }
  }

  const pending = friends.filter(f => f.status === 'PENDING');
  const accepted = friends.filter(f => f.status === 'ACCEPTED');

  return (
    <div className="dark-overlay" onClick={onClose}>
      <div className="profile-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Friends</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
              <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>
            </button>
        </div>

        <div className="modal-msg">
          {message && <p className="ok">{message}</p>}
          {error && <p className="err">{error}</p>}
        </div>

        <section className="modal-section">
          <form onSubmit={handleSendRequest} className="inline-form">
            <input type="email" value={friendEmail} onChange={e => setFriendEmail(e.target.value)} placeholder="Add friend by email" />
            <button type="submit" className="auth-submit" disabled={loading || !friendEmail.trim()}>{loading ? '…' : 'Add'}</button>
          </form>
        </section>

        {pending.length > 0 && (
          <section className="modal-section">
            <h3>Requests</h3>
            <ul className="friends-list">
              {pending.map(f => (
                <li key={f.id} className="friend-item">
                  <div className="friend-info">
                    <span className="friend-name">{f.user.name || f.user.email}</span>
                    <span className="friend-status">{f.direction === 'sent' ? 'Request sent' : 'Wants to be friends'}</span>
                  </div>
                  <div className="friend-actions">
                    {f.direction === 'received' && (
                      <button className="btn mini ink" onClick={() => handleAccept(f.id)}>Accept</button>
                    )}
                    <button className="btn mini line" onClick={() => handleRemove(f.id)}>
                      {f.direction === 'sent' ? 'Cancel' : 'Decline'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="modal-section">
          <h3>My friends</h3>
          {friendsLoading ? (
            <p className="friends-empty">Loading…</p>
          ) : accepted.length === 0 ? (
            <p className="friends-empty">No friends yet. Add someone above!</p>
          ) : (
            <ul className="friends-list">
              {accepted.map(f => (
                <li key={f.id} className="friend-item">
                  <span className="friend-name">{f.user.name || f.user.email}</span>
                  <button className="btn mini line" onClick={() => handleRemove(f.id)}>Unfriend</button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
