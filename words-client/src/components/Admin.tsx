import { useState, useEffect } from 'react';
import { adminApi, setAdminToken, clearAdminToken, isAdminLoggedIn } from '../api';
import type { WordleAdminWord } from '../api';
import './Admin.css';

type AdminTab = 'words' | 'jobs';

export default function Admin() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [activeTab, setActiveTab] = useState<AdminTab>('words');

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  useEffect(() => {
    if (isAdminLoggedIn()) {
      adminApi.verify()
        .then(() => setIsAuthenticated(true))
        .catch(() => { clearAdminToken(); setIsAuthenticated(false); })
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
    return <div className="admin-page"><div className="admin-container"><p>Loading...</p></div></div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="admin-page">
        <div className="admin-login">
          <h1>67words Admin</h1>
          <form onSubmit={handleLogin}>
            <div className="admin-form-group">
              <label htmlFor="username">Username</label>
              <input type="text" id="username" value={username} onChange={e => setUsername(e.target.value)} required />
            </div>
            <div className="admin-form-group">
              <label htmlFor="password">Password</label>
              <input type="password" id="password" value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
            {loginError && <div className="admin-error">{loginError}</div>}
            <button type="submit" className="admin-btn primary" disabled={loginLoading}>
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
          <h1>67words Admin</h1>
          <button onClick={handleLogout} className="admin-logout-btn">Logout</button>
        </div>
        <div className="admin-tabs">
          <button className={`admin-tab ${activeTab === 'words' ? 'active' : ''}`} onClick={() => setActiveTab('words')}>
            Daily Words
          </button>
          <button className={`admin-tab ${activeTab === 'jobs' ? 'active' : ''}`} onClick={() => setActiveTab('jobs')}>
            Jobs
          </button>
        </div>
        <div className="admin-tab-content">
          {activeTab === 'words' && <WordsTab />}
          {activeTab === 'jobs' && <JobsTab />}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// JOBS TAB
// =============================================================================

type JobResult = { text: string; isError: boolean } | null;

interface Job {
  id: string;
  name: string;
  schedule: string;
  run: () => Promise<string>;
}

function JobsTab() {
  const [results, setResults] = useState<Record<string, JobResult>>({});
  const [running, setRunning] = useState<Record<string, boolean>>({});

  const jobs: Job[] = [
    {
      id: 'seed-words',
      name: 'Seed Daily Words',
      schedule: 'On server startup',
      run: async () => {
        const r = await adminApi.seedWords();
        return `Created ${r.created}, existing ${r.existing}`;
      },
    },
    {
      id: 'calculate-wordle-points',
      name: 'Calculate Points',
      schedule: 'Startup + daily 00:00:30 UTC',
      run: async () => {
        const r = await adminApi.calculateWordlePoints();
        return `${r.usersProcessed} users, ${r.resultsProcessed} results processed`;
      },
    },
    {
      id: 'check-names',
      name: 'Check Name Utilization',
      schedule: 'Daily 00:00:30 UTC',
      run: async () => {
        await adminApi.checkNames();
        return 'Done';
      },
    },
    {
      id: 'generate-dummy-words',
      name: 'Generate Dummy Data (67words)',
      schedule: 'Manual only',
      run: async () => {
        const r = await adminApi.generateDummyWords();
        return `${r.usersCreated} users, ${r.resultsCreated} results created`;
      },
    },
    {
      id: 'delete-dummy-data',
      name: 'Delete Dummy Data',
      schedule: 'Manual only',
      run: async () => {
        const r = await adminApi.deleteDummyData();
        return `${r.usersDeleted} dummy users deleted`;
      },
    },
  ];

  const handleTrigger = async (job: Job) => {
    setRunning(prev => ({ ...prev, [job.id]: true }));
    setResults(prev => ({ ...prev, [job.id]: null }));
    try {
      const text = await job.run();
      setResults(prev => ({ ...prev, [job.id]: { text, isError: false } }));
    } catch (err) {
      const text = err instanceof Error ? err.message : 'Failed';
      setResults(prev => ({ ...prev, [job.id]: { text, isError: true } }));
    } finally {
      setRunning(prev => ({ ...prev, [job.id]: false }));
    }
  };

  return (
    <section className="admin-list-section">
      <h3>Scheduled Jobs</h3>
      <table className="jobs-table">
        <thead>
          <tr>
            <th>Job</th>
            <th>Schedule</th>
            <th>Last Run Result</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map(job => {
            const result = results[job.id];
            const isRunning = running[job.id] ?? false;
            return (
              <tr key={job.id}>
                <td>{job.name}</td>
                <td className="job-schedule">{job.schedule}</td>
                <td>
                  {result && (
                    <span className={`job-result ${result.isError ? 'error' : 'success'}`}>
                      {result.text}
                    </span>
                  )}
                </td>
                <td>
                  <button
                    onClick={() => handleTrigger(job)}
                    disabled={isRunning}
                    className="admin-btn small"
                  >
                    {isRunning ? 'Running...' : 'Trigger'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function WordsTab() {
  const [words, setWords] = useState<WordleAdminWord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [editDate, setEditDate] = useState('');
  const [editWord, setEditWord] = useState('');
  const [expectedLength, setExpectedLength] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const [pointsLoading, setPointsLoading] = useState(false);
  const [pointsMessage, setPointsMessage] = useState('');

  useEffect(() => { loadWords(); }, []);

  // Update expected length when editDate changes
  useEffect(() => {
    if (!editDate) { setExpectedLength(null); return; }
    const existing = words.find(w => w.date.startsWith(editDate));
    if (existing) {
      setExpectedLength(existing.wordLength);
    } else {
      setExpectedLength(null); // server will determine
    }
  }, [editDate, words]);

  const loadWords = async () => {
    try {
      const response = await adminApi.listWords();
      setWords(response.words);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load words');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (w: WordleAdminWord) => {
    const date = new Date(w.date);
    setEditDate(date.toISOString().split('T')[0]);
    setEditWord(w.word);
    setExpectedLength(w.wordLength);
    setError('');
    setMessage('');
  };

  const handleNew = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setEditDate(tomorrow.toISOString().split('T')[0]);
    setEditWord('');
    setExpectedLength(null);
    setError('');
    setMessage('');
  };

  const handleGenerateRandom = async () => {
    if (!editDate) { setError('Please select a date first'); return; }
    setSaving(true); setError(''); setMessage('');
    try {
      const response = await adminApi.saveWord(editDate, { generateRandom: true });
      setEditWord(response.word.word);
      setExpectedLength(response.word.wordLength);
      setMessage(response.created ? 'Word created with random value' : 'Word updated with random value');
      loadWords();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate random word');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!editDate) { setError('Please select a date'); return; }
    const word = editWord.trim().toUpperCase();
    if (!word) { setError('Please enter a word'); return; }
    setSaving(true); setError(''); setMessage('');
    try {
      const response = await adminApi.saveWord(editDate, { word });
      setMessage(response.created ? 'Word created successfully' : 'Word updated successfully');
      loadWords();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save word');
    } finally {
      setSaving(false);
    }
  };

  const handleCalculatePoints = async () => {
    setPointsLoading(true); setPointsMessage('');
    try {
      const result = await adminApi.calculateWordlePoints();
      setPointsMessage(`Done — ${result.usersProcessed} users updated`);
    } catch (err) {
      setPointsMessage(err instanceof Error ? err.message : 'Failed');
    } finally {
      setPointsLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = dateStr.includes('T') ? new Date(dateStr) : new Date(dateStr + 'T00:00:00Z');
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }) + ' (UTC)';
  };

  const isToday = (dateStr: string) => {
    const date = dateStr.includes('T') ? new Date(dateStr) : new Date(dateStr + 'T00:00:00Z');
    const now = new Date();
    return date.getUTCFullYear() === now.getUTCFullYear() && date.getUTCMonth() === now.getUTCMonth() && date.getUTCDate() === now.getUTCDate();
  };

  const isPast = (dateStr: string) => {
    const date = dateStr.includes('T') ? new Date(dateStr) : new Date(dateStr + 'T00:00:00Z');
    const now = new Date();
    const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    return date.getTime() < todayUTC;
  };

  const canEdit = (dateStr: string) => !isToday(dateStr) && !isPast(dateStr);

  const editingWord = words.find(w => w.date.startsWith(editDate));

  return (
    <>
      {message && <div className="admin-message">{message}</div>}
      {error && <div className="admin-error">{error}</div>}

      <section className="admin-edit-section">
        <h3>{editDate ? `${editingWord?.name ?? editDate} — ${formatDate(editDate)}` : 'Create New Daily Word'}</h3>
        <div className="admin-edit-form">
          <div className="admin-form-group">
            <label htmlFor="editDate">Date</label>
            <input type="date" id="editDate" value={editDate} onChange={e => setEditDate(e.target.value)} />
          </div>
          <div className="admin-form-group">
            <label htmlFor="editWord">Word {expectedLength ? <span className="admin-hint">({expectedLength} letters)</span> : ''}</label>
            <input
              type="text"
              id="editWord"
              value={editWord}
              onChange={e => setEditWord(e.target.value.toUpperCase())}
              maxLength={7}
              placeholder="WORD"
              className="admin-word-input"
            />
          </div>
          <div className="admin-edit-actions">
            <button onClick={handleNew} className="admin-btn secondary">+ New</button>
            <button onClick={handleGenerateRandom} disabled={saving} className="admin-btn">Generate Random</button>
            <button onClick={handleSave} disabled={saving} className="admin-btn primary">{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </div>
      </section>

      <section className="admin-list-section">
        <h3>Daily Words</h3>
        {loading ? <p>Loading...</p> : words.length === 0 ? <p>No words found</p> : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Date</th>
                <th>Word</th>
                <th>Length</th>
                <th>Source</th>
                <th>Plays</th>
                <th>Win Rate</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {words.map(w => (
                <tr key={w.id} className={`${isToday(w.date) ? 'today' : ''} ${isPast(w.date) ? 'past' : ''}`}>
                  <td className="admin-cell-muted">{w.name ?? '-'}</td>
                  <td>{formatDate(w.date)}</td>
                  <td className="admin-cell-word">{w.word}</td>
                  <td>{w.wordLength}L</td>
                  <td className={`admin-source ${w.isManual ? 'manual' : 'random'}`}>{w.isManual ? 'Manual' : 'Auto'}</td>
                  <td>{w.playCount}</td>
                  <td>{w.successRate !== null ? `${w.successRate}%` : '—'}</td>
                  <td>{canEdit(w.date) && <button className="admin-btn small" onClick={() => handleEdit(w)}>Edit</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="admin-edit-section">
        <h3>Points</h3>
        <div className="admin-edit-form">
          <button onClick={handleCalculatePoints} disabled={pointsLoading} className="admin-btn primary">
            {pointsLoading ? 'Calculating...' : 'Recalculate Points'}
          </button>
          {pointsMessage && <span className="admin-hint">{pointsMessage}</span>}
        </div>
      </section>
    </>
  );
}
