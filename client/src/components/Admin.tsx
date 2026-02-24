import { useState, useEffect } from 'react';
import { adminApi, Challenge, setAdminToken, clearAdminToken, isAdminLoggedIn } from '../api';

type AdminTab = 'challenges';

// Epoch date for calculating daily challenge number (Day 1 = Jan 1, 2026 UTC)
const DAILY_EPOCH = Date.UTC(2026, 0, 1); // January 1, 2026

/**
 * Calculate the daily challenge number based on the date.
 * Day 1 = January 1, 2026
 */
function getDailyNumber(dateStr: string): number {
  const date = dateStr.includes('T') ? new Date(dateStr) : new Date(dateStr + 'T00:00:00Z');
  const daysSinceEpoch = Math.floor((date.getTime() - DAILY_EPOCH) / (24 * 60 * 60 * 1000));
  return daysSinceEpoch + 1; // Day 1, not Day 0
}

export default function Admin() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [activeTab, setActiveTab] = useState<AdminTab>('challenges');

  // Login form
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // Check if already logged in
  useEffect(() => {
    if (isAdminLoggedIn()) {
      adminApi.verify()
        .then(() => setIsAuthenticated(true))
        .catch(() => {
          clearAdminToken();
          setIsAuthenticated(false);
        })
        .finally(() => setCheckingAuth(false));
    } else {
      setCheckingAuth(false);
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);

    try {
      const response = await adminApi.login(username, password);
      setAdminToken(response.token);
      setIsAuthenticated(true);
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    clearAdminToken();
    setIsAuthenticated(false);
    setUsername('');
    setPassword('');
  };

  if (checkingAuth) {
    return (
      <div className="admin-page">
        <div className="admin-container">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="admin-page">
        <div className="admin-login">
          <h1>Admin Login</h1>

          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label htmlFor="username">Username</label>
              <input
                type="text"
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {loginError && <div className="auth-error">{loginError}</div>}

            <button type="submit" className="auth-submit" disabled={loginLoading}>
              {loginLoading ? 'Logging in...' : 'Login'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="admin-container">
        <div className="admin-header">
          <h1>Admin</h1>
          <button onClick={handleLogout} className="logout-btn">Logout</button>
        </div>

        <div className="admin-tabs">
          <button
            className={`admin-tab ${activeTab === 'challenges' ? 'active' : ''}`}
            onClick={() => setActiveTab('challenges')}
          >
            Daily Challenges
          </button>
          {/* Future tabs will go here */}
        </div>

        <div className="admin-tab-content">
          {activeTab === 'challenges' && <ChallengesTab />}
        </div>
      </div>
    </div>
  );
}

function ChallengesTab() {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // Edit form state
  const [editDate, setEditDate] = useState('');
  const [editTiles, setEditTiles] = useState<string[]>(['', '', '', '', '', '']);
  const [editTarget, setEditTarget] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadChallenges();
  }, []);

  const loadChallenges = async () => {
    try {
      const response = await adminApi.listChallenges();
      setChallenges(response.challenges);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load challenges');
    } finally {
      setLoading(false);
    }
  };

  const handleEditChallenge = (challenge: Challenge) => {
    const date = new Date(challenge.date);
    setEditDate(date.toISOString().split('T')[0]);
    setEditTiles(challenge.tiles.map(String));
    setEditTarget(String(challenge.targetNumber));
    setError('');
    setMessage('');
  };

  const handleNewChallenge = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setEditDate(tomorrow.toISOString().split('T')[0]);
    setEditTiles(['', '', '', '', '', '']);
    setEditTarget('');
    setError('');
    setMessage('');
  };

  const handleTileChange = (index: number, value: string) => {
    // Only allow numeric input
    if (value !== '' && !/^\d+$/.test(value)) return;

    const newTiles = [...editTiles];
    newTiles[index] = value;
    setEditTiles(newTiles);
  };

  const handleTargetChange = (value: string) => {
    // Only allow numeric input
    if (value !== '' && !/^\d+$/.test(value)) return;
    setEditTarget(value);
  };

  const handleGenerateRandom = async () => {
    if (!editDate) {
      setError('Please select a date first');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const response = await adminApi.saveChallenge(editDate, { generateRandom: true });
      setEditTiles(response.challenge.tiles.map(String));
      setEditTarget(String(response.challenge.targetNumber));
      setMessage(response.created ? 'Challenge created with random values' : 'Challenge updated with random values');
      loadChallenges();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate random challenge');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!editDate) {
      setError('Please select a date');
      return;
    }

    const tiles = editTiles.map(Number);
    const target = Number(editTarget);

    // Validate tiles
    if (tiles.some(isNaN) || tiles.some(t => t <= 0)) {
      setError('All tiles must be positive numbers');
      return;
    }

    // Validate target range
    if (isNaN(target) || target < 101 || target > 999) {
      setError('Target must be between 101 and 999');
      return;
    }

    // Validate max 2 large tiles
    const largeTiles = tiles.filter(t => t > 10);
    if (largeTiles.length > 2) {
      setError('No more than 2 tiles can be greater than 10');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const response = await adminApi.saveChallenge(editDate, { tiles, targetNumber: target });
      setMessage(response.created ? 'Challenge created successfully' : 'Challenge updated successfully');
      loadChallenges();
    } catch (err) {
      // This will catch uniqueness errors from the backend
      setError(err instanceof Error ? err.message : 'Failed to save challenge');
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateStr: string) => {
    // Handle both ISO strings and YYYY-MM-DD format consistently as UTC
    const date = dateStr.includes('T') ? new Date(dateStr) : new Date(dateStr + 'T00:00:00Z');
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC'
    }) + ' (UTC)';
  };

  const isToday = (dateStr: string) => {
    // Handle both ISO strings and YYYY-MM-DD format consistently as UTC
    const date = dateStr.includes('T') ? new Date(dateStr) : new Date(dateStr + 'T00:00:00Z');
    const now = new Date();
    // Compare UTC dates
    return date.getUTCFullYear() === now.getUTCFullYear() &&
           date.getUTCMonth() === now.getUTCMonth() &&
           date.getUTCDate() === now.getUTCDate();
  };

  const isPast = (dateStr: string) => {
    // Handle both ISO strings and YYYY-MM-DD format consistently as UTC
    const date = dateStr.includes('T') ? new Date(dateStr) : new Date(dateStr + 'T00:00:00Z');
    const now = new Date();
    // Create UTC midnight for today
    const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    return date.getTime() < todayUTC;
  };

  const canEdit = (dateStr: string) => {
    // Can only edit future challenges (not today or past)
    return !isToday(dateStr) && !isPast(dateStr);
  };

  return (
    <>
      {message && <div className="auth-message">{message}</div>}
      {error && <div className="auth-error">{error}</div>}

      {/* Edit Form - Full width at top */}
      <section className="admin-edit-section">
        <h3>{editDate ? `Edit Daily #${getDailyNumber(editDate)} - ${formatDate(editDate)}` : 'Create New Challenge'}</h3>

        <div className="admin-edit-form">
          <div className="form-group">
            <label htmlFor="editDate">Date</label>
            <input
              type="date"
              id="editDate"
              value={editDate}
              onChange={(e) => setEditDate(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>Tiles (6 numbers)</label>
            <div className="tiles-input">
              {editTiles.map((tile, i) => (
                <input
                  key={i}
                  type="text"
                  inputMode="numeric"
                  value={tile}
                  onChange={(e) => handleTileChange(i, e.target.value)}
                  placeholder={`#${i + 1}`}
                />
              ))}
            </div>
            <small>Max 2 tiles can be &gt; 10</small>
          </div>

          <div className="form-group">
            <label htmlFor="editTarget">Target Number</label>
            <input
              type="text"
              inputMode="numeric"
              id="editTarget"
              value={editTarget}
              onChange={(e) => handleTargetChange(e.target.value)}
              placeholder="101-999"
            />
          </div>

          <div className="admin-edit-actions">
            <button onClick={handleNewChallenge} className="secondary">
              + New Challenge
            </button>
            <button onClick={handleGenerateRandom} disabled={saving}>
              Generate Random
            </button>
            <button onClick={handleSave} disabled={saving} className="primary">
              {saving ? 'Saving...' : 'Save Challenge'}
            </button>
          </div>
        </div>
      </section>

      {/* Challenge List - Full width below */}
      <section className="admin-list-section">
        <h3>Daily Challenges</h3>
        {loading ? (
          <p>Loading...</p>
        ) : challenges.length === 0 ? (
          <p>No challenges yet</p>
        ) : (
          <table className="challenges-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Date</th>
                <th>Target</th>
                <th>Tiles</th>
                <th>Source</th>
                <th>Plays</th>
                <th>Success Rate</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {challenges.map((challenge) => (
                <tr
                  key={challenge.id}
                  className={`${isToday(challenge.date) ? 'today' : ''} ${isPast(challenge.date) ? 'past' : ''}`}
                >
                  <td className="challenge-number">#{getDailyNumber(challenge.date)}</td>
                  <td className="challenge-date">{formatDate(challenge.date)}</td>
                  <td>{challenge.targetNumber}</td>
                  <td className="challenge-tiles">[{challenge.tiles.join(', ')}]</td>
                  <td className={`challenge-source ${challenge.isManual ? 'manual' : 'random'}`}>
                    {challenge.isManual ? 'Manual' : 'Random'}
                  </td>
                  <td>{challenge.playCount}</td>
                  <td>{challenge.successRate !== null ? `${challenge.successRate}%` : '-'}</td>
                  <td>
                    {canEdit(challenge.date) && (
                      <button onClick={() => handleEditChallenge(challenge)}>Edit</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
