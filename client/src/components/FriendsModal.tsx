import { useState, useEffect } from 'react';
import { friendsApi, Friend } from '../api';

interface FriendsModalProps {
  onClose: () => void;
}

export default function FriendsModal({ onClose }: FriendsModalProps) {
  const [friendEmail, setFriendEmail] = useState('');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(false);
  const [friendsLoading, setFriendsLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    loadFriends();
  }, []);

  const loadFriends = async () => {
    try {
      const response = await friendsApi.list();
      setFriends(response.friends);
    } catch (err) {
      console.error('Failed to load friends:', err);
    } finally {
      setFriendsLoading(false);
    }
  };

  const handleSendRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    if (!friendEmail.trim()) return;
    setLoading(true);
    try {
      const response = await friendsApi.sendRequest(friendEmail.trim());
      setFriends([...friends, response.friend]);
      setFriendEmail('');
      setMessage('Friend request sent');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send request');
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptRequest = async (id: string) => {
    try {
      const response = await friendsApi.acceptRequest(id);
      setFriends(friends.map((f) => (f.id === id ? response.friend : f)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept request');
    }
  };

  const handleRemoveFriend = async (id: string) => {
    try {
      await friendsApi.remove(id);
      setFriends(friends.filter((f) => f.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove friend');
    }
  };

  const notifications = friends.filter(f => f.status === 'PENDING');
  const accepted = friends.filter(f => f.status === 'ACCEPTED');

  return (
    <div className="auth-overlay" onClick={onClose}>
      <div className="friends-modal" onClick={(e) => e.stopPropagation()}>

        <div className="profile-header">
          <h1 className="profile-title">Friends</h1>
        </div>

        {message && <div className="auth-message">{message}</div>}
        {error && <div className="auth-error">{error}</div>}

        {/* Add friend */}
        <section className="profile-section">
          <form onSubmit={handleSendRequest} className="inline-form">
            <input
              type="email"
              value={friendEmail}
              onChange={(e) => setFriendEmail(e.target.value)}
              placeholder="Add a friend by email"
            />
            <button type="submit" className="auth-submit inline-submit" disabled={loading || !friendEmail.trim()}>
              {loading ? '...' : 'Add'}
            </button>
          </form>
        </section>

        {/* Notifications */}
        {notifications.length > 0 && (
          <section className="profile-section">
            <h3 className="friends-section-title">Notifications</h3>
            <ul className="friends-list">
              {notifications.map((friend) => (
                <li key={friend.id} className="friend-item">
                  <div className="friend-info">
                    <span className="friend-name">{friend.user.name || friend.user.email}</span>
                    <span className="friend-status status-pending">
                      {friend.direction === 'sent' ? 'Request sent' : 'Wants to be friends'}
                    </span>
                  </div>
                  <div className="friend-actions">
                    {friend.direction === 'received' && (
                      <button className="friend-accept" onClick={() => handleAcceptRequest(friend.id)}>
                        Accept
                      </button>
                    )}
                    <button className="friend-remove" onClick={() => handleRemoveFriend(friend.id)}>
                      {friend.direction === 'sent' ? 'Cancel' : 'Decline'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Friends list */}
        <section className="profile-section">
          <h3 className="friends-section-title">My Friends</h3>
          {friendsLoading ? (
            <p className="friends-loading">Loading...</p>
          ) : accepted.length === 0 ? (
            <p className="friends-empty">No friends yet. Add someone above!</p>
          ) : (
            <ul className="friends-list">
              {accepted.map((friend) => (
                <li key={friend.id} className="friend-item">
                  <div className="friend-info">
                    <span className="friend-name">{friend.user.name || friend.user.email}</span>
                  </div>
                  <div className="friend-actions">
                    <button className="friend-remove" onClick={() => handleRemoveFriend(friend.id)}>
                      Unfriend
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

      </div>
    </div>
  );
}
