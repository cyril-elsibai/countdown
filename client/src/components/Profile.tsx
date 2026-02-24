import { useState, useEffect } from 'react';
import { authApi, friendsApi, User, Friend } from '../api';

interface ProfileProps {
  user: User;
  onUserUpdate: (user: User) => void;
  onClose: () => void;
}

export default function Profile({ user, onUserUpdate, onClose }: ProfileProps) {
  const [name, setName] = useState(user.name || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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

  const handleUpdateName = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      const response = await authApi.updateProfile(name);
      onUserUpdate(response.user);
      setMessage('Name updated successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update name');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      const response = await authApi.changePassword(currentPassword, newPassword);
      setMessage(response.message);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setLoading(false);
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

  const getStatusText = (friend: Friend) => {
    if (friend.status === 'ACCEPTED') return 'Friend';
    if (friend.direction === 'sent') return 'Request sent';
    return 'Pending request';
  };

  return (
    <div className="auth-overlay">
      <div className="profile-modal">
        <button className="auth-close" onClick={onClose}>&times;</button>

        <h2>Profile</h2>

        {message && <div className="auth-message">{message}</div>}
        {error && <div className="auth-error">{error}</div>}

        {/* Update Name */}
        <section className="profile-section">
          <h3>Update Name</h3>
          <form onSubmit={handleUpdateName}>
            <div className="form-group">
              <label htmlFor="name">Name</label>
              <input
                type="text"
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
              />
            </div>
            <button type="submit" className="auth-submit" disabled={loading}>
              {loading ? 'Saving...' : 'Update Name'}
            </button>
          </form>
        </section>

        {/* Change Password */}
        <section className="profile-section">
          <h3>Change Password</h3>
          <form onSubmit={handleChangePassword}>
            <div className="form-group">
              <label htmlFor="currentPassword">Current Password</label>
              <input
                type="password"
                id="currentPassword"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Current password"
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="newPassword">New Password</label>
              <input
                type="password"
                id="newPassword"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password"
                required
                minLength={6}
              />
            </div>
            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm New Password</label>
              <input
                type="password"
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                required
                minLength={6}
              />
            </div>
            <button type="submit" className="auth-submit" disabled={loading}>
              {loading ? 'Changing...' : 'Change Password'}
            </button>
          </form>
        </section>

        {/* Friends */}
        <section className="profile-section">
          <h3>Friends</h3>

          {/* Add friend form */}
          <form onSubmit={handleSendRequest} className="friend-request-form">
            <input
              type="email"
              value={friendEmail}
              onChange={(e) => setFriendEmail(e.target.value)}
              placeholder="Enter email to add friend"
            />
            <button type="submit" disabled={loading || !friendEmail.trim()}>
              Add
            </button>
          </form>

          {/* Friends list */}
          {friendsLoading ? (
            <p className="friends-loading">Loading friends...</p>
          ) : friends.length === 0 ? (
            <p className="friends-empty">No friends yet. Add someone above!</p>
          ) : (
            <ul className="friends-list">
              {friends.map((friend) => (
                <li key={friend.id} className="friend-item">
                  <div className="friend-info">
                    <span className="friend-name">
                      {friend.user.name || friend.user.email}
                    </span>
                    <span className={`friend-status status-${friend.status.toLowerCase()}`}>
                      {getStatusText(friend)}
                    </span>
                  </div>
                  <div className="friend-actions">
                    {friend.status === 'PENDING' && friend.direction === 'received' && (
                      <button
                        className="friend-accept"
                        onClick={() => handleAcceptRequest(friend.id)}
                      >
                        Accept
                      </button>
                    )}
                    <button
                      className="friend-remove"
                      onClick={() => handleRemoveFriend(friend.id)}
                    >
                      {friend.status === 'ACCEPTED' ? 'Remove' : 'Cancel'}
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
