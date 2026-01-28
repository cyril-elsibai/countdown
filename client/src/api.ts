const API_URL = 'http://localhost:3001/api';

// Get stored auth token
function getToken(): string | null {
  return localStorage.getItem('token');
}

// Set auth token
export function setToken(token: string): void {
  localStorage.setItem('token', token);
}

// Clear auth token
export function clearToken(): void {
  localStorage.removeItem('token');
}

// Check if user is logged in
export function isLoggedIn(): boolean {
  return !!getToken();
}

// Make authenticated request
async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
  };

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: { ...headers, ...options.headers },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data;
}

// Types
export interface Frame {
  id: string;
  tiles: number[];
  targetNumber: number;
  date?: string;
}

export interface DailyResponse {
  frame: Frame;
  alreadyPlayed: boolean;
}

export interface SubmitResponse {
  success: boolean;
  valid: boolean;
  result?: number;
  solved: boolean;
  error?: string;
}

export interface User {
  id: string;
  email: string;
  name?: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

// Game API
export const gameApi = {
  // Get today's daily challenge
  getDaily: () => request<DailyResponse>('/game/daily'),

  // Generate a random frame (requires auth)
  getRandom: () => request<{ frame: Frame }>('/game/random', { method: 'POST' }),

  // Get a specific frame by ID
  getFrame: (id: string) => request<{ frame: Frame }>(`/game/frame/${id}`),

  // Submit a solution
  submit: (frameId: string, expression: string, duration: number) =>
    request<SubmitResponse>(`/game/frame/${frameId}/submit`, {
      method: 'POST',
      body: JSON.stringify({ expression, duration }),
    }),
};

// Auth API
export const authApi = {
  register: (email: string, password: string, name?: string) =>
    request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    }),

  login: (email: string, password: string) =>
    request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  me: () => request<{ user: User }>('/auth/me'),
};
