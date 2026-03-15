const API_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:3001/api`;

function getToken(): string | null {
  return localStorage.getItem('token');
}

export function setToken(token: string) {
  localStorage.setItem('token', token);
}

export function removeToken() {
  localStorage.removeItem('token');
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// =============================================================================
// TYPES
// =============================================================================

export type LetterStatus = 'correct' | 'present' | 'absent';

export interface GuessResult {
  guess: string;
  feedback: LetterStatus[];
  solved: boolean;
}

export interface WordleGameState {
  word: {
    id: string;
    wordLength: number;
    date: string | null;
    name: string | null;
  };
  guesses: GuessResult[];
  guessCount: number;
  maxGuesses: number;
  solved: boolean;
  gameOver: boolean;
  duration: number | null;
  startedAt: string | null;
  answer: string | null; // only revealed when gameOver
}

export interface User {
  id: string;
  email: string;
  name: string | null;
}

// =============================================================================
// AUTH API
// =============================================================================

export const authApi = {
  login: (email: string, password: string) =>
    request<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  register: (email: string, password: string, name: string) =>
    request<{ message: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    }),

  me: () => request<{ user: User }>('/auth/me'),

  updateProfile: (name: string) =>
    request<{ user: User }>('/auth/me', {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ message: string }>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  verify: (token: string) =>
    request<{ token: string; user: User }>('/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),

  resendVerification: (email: string) =>
    request<{ message: string }>('/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  forgotPassword: (email: string) =>
    request<{ message: string }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  resetPassword: (token: string, password: string) =>
    request<{ message: string }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    }),
};

// =============================================================================
// WORDLE API
// =============================================================================

export const wordleApi = {
  getDaily: () => request<WordleGameState>('/wordle/daily'),

  getWord: (id: string) => request<WordleGameState>(`/wordle/word/${id}`),

  startWord: (id: string) =>
    request<{ started: boolean }>(`/wordle/word/${id}/start`, { method: 'POST' }),

  submitGuess: (id: string, guess: string) =>
    request<WordleGameState>(`/wordle/word/${id}/guess`, {
      method: 'POST',
      body: JSON.stringify({ guess }),
    }),

  getRandom: () => request<WordleGameState>('/wordle/random', { method: 'POST' }),

  getWordStats: (id: string) =>
    request<{ totalPlays: number; winRate: number; guessDist: number[] }>(`/wordle/word/${id}/stats`),
};

// =============================================================================
// WORDLE DASHBOARD TYPES & API
// =============================================================================

export interface WordleHistoryChallenge {
  id: string;
  date: string;
  dailyNumber: number | null;
  wordLength: number;
  difficulty: { completionPercent: number; totalAttempts: number };
  userResult: { solved: boolean; guessCount: number; duration: number | null } | null;
}

export interface WordleLeaderboardEntry {
  rank: number;
  userId: string;
  name: string;
  guessCount: number;
  duration: number | null;
  solved: boolean;
  playedAt: string;
}

export interface WordleLeaderboardResponse {
  leaderboard: WordleLeaderboardEntry[];
  userRank: number | null;
  wordId: string | null;
  dailyNumber: number | null;
  wordLength: number;
}

export interface WordleOverallLeaderboardEntry {
  rank: number;
  userId: string;
  name: string;
  totalPoints: number;
}

export interface WordleOverallLeaderboardResponse {
  leaderboard: WordleOverallLeaderboardEntry[];
  userRank: number | null;
  userPoints: number;
}

export interface WordleUserStats {
  totalGamesPlayed: number;
  successRate: number;
  avgGuesses: number | null;
  bestTime: number | null;
  guessDist: number[];
  currentStreak: number;
  longestStreak: number;
}

export interface WordleStatsResponse {
  myStats: { forever: WordleUserStats; month: WordleUserStats; week: WordleUserStats };
  friendStats: { forever: WordleUserStats; month: WordleUserStats; week: WordleUserStats } | null;
  friendName: string | null;
  friends: { id: string; name: string | null }[];
}

export interface WordlePlayHistoryEntry {
  wordId: string;
  name: string | null;
  date: string | null;
  wordLength: number;
  solved: boolean;
  guessCount: number;
  duration: number | null;
  playedAt: string;
}

export interface WordleFriendActivity {
  id: string;
  userId: string;
  name: string;
  wordId: string;
  dailyNumber: number | null;
  wordLength: number;
  solved: boolean;
  guessCount: number;
  duration: number | null;
  playedAt: string;
}

export const wordleDashboardApi = {
  getHistory: (year: number, month: number) =>
    request<{ challenges: WordleHistoryChallenge[] }>(`/wordle/dashboard/history?year=${year}&month=${month}`),

  getLeaderboard: (type: 'global' | 'friends', wordId?: string) =>
    request<WordleLeaderboardResponse>(`/wordle/dashboard/leaderboard?type=${type}${wordId ? `&wordId=${wordId}` : ''}`),

  getOverallLeaderboard: () =>
    request<WordleOverallLeaderboardResponse>('/wordle/dashboard/overall-leaderboard'),

  getFriendsActivity: (limit = 20) =>
    request<{ activity: WordleFriendActivity[] }>(`/wordle/dashboard/friends-activity?limit=${limit}`),

  getPlayHistory: () =>
    request<{ history: WordlePlayHistoryEntry[] }>('/wordle/dashboard/play-history'),

  getStats: (compareWith?: string) =>
    request<WordleStatsResponse>(`/wordle/dashboard/stats${compareWith ? `?compareWith=${compareWith}` : ''}`),
};

// =============================================================================
// FRIENDS API
// =============================================================================

export interface Friend {
  id: string;
  status: 'PENDING' | 'ACCEPTED';
  direction: 'sent' | 'received';
  user: User;
  createdAt: string;
}

export const friendsApi = {
  list: () => request<{ friends: Friend[] }>('/friends'),

  sendRequest: (email: string) =>
    request<{ friend: Friend }>('/friends/request', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  acceptRequest: (id: string) =>
    request<{ friend: Friend }>(`/friends/${id}/accept`, { method: 'POST' }),

  remove: (id: string) =>
    request<{ message: string }>(`/friends/${id}`, { method: 'DELETE' }),
};

// =============================================================================
// ADMIN API
// =============================================================================

const ADMIN_TOKEN_KEY = 'wordle_admin_token';

function getAdminToken(): string | null {
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function setAdminToken(token: string) {
  localStorage.setItem(ADMIN_TOKEN_KEY, token);
}

export function clearAdminToken() {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
}

export function isAdminLoggedIn(): boolean {
  return !!getAdminToken();
}

async function adminRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAdminToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export interface WordleAdminWord {
  id: string;
  date: string;
  name: string | null;
  word: string;
  wordLength: number;
  isManual: boolean;
  playCount: number;
  successRate: number | null;
}

export const adminApi = {
  login: (username: string, password: string) =>
    adminRequest<{ token: string }>('/admin/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  verify: () => adminRequest<{ valid: boolean }>('/admin/verify'),

  listWords: () => adminRequest<{ words: WordleAdminWord[] }>('/admin/wordle/words'),

  saveWord: (date: string, body: { word: string } | { generateRandom: true }) =>
    adminRequest<{ word: WordleAdminWord; created: boolean }>(`/admin/wordle/words/${date}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  seedChallenges: () =>
    adminRequest<{ success: boolean; created: number; existing: number }>('/admin/jobs/seed-challenges', { method: 'POST' }),

  seedWords: () =>
    adminRequest<{ success: boolean; created: number; existing: number }>('/admin/jobs/seed-words', { method: 'POST' }),

  checkNames: () =>
    adminRequest<{ success: boolean }>('/admin/jobs/check-names', { method: 'POST' }),

  calculatePoints: () =>
    adminRequest<{ success: boolean; usersProcessed: number; resultsProcessed: number }>('/admin/points/calculate', { method: 'POST' }),

  calculateWordlePoints: () =>
    adminRequest<{ success: boolean; usersProcessed: number; resultsProcessed: number }>('/admin/wordle/points/calculate', { method: 'POST' }),

  generateDummyNumbers: () =>
    adminRequest<{ success: boolean; usersCreated: number; resultsCreated: number }>('/admin/jobs/generate-dummy-numbers', { method: 'POST' }),

  generateDummyWords: () =>
    adminRequest<{ success: boolean; usersCreated: number; resultsCreated: number }>('/admin/jobs/generate-dummy-words', { method: 'POST' }),

  deleteDummyData: () =>
    adminRequest<{ success: boolean; usersDeleted: number }>('/admin/jobs/delete-dummy-data', { method: 'POST' }),
};
