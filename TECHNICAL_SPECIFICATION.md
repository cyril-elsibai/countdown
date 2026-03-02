# 6-7 Numbers (Countdown Numbers Game) - Technical Specification

**Version:** 2.0.0
**Last Updated:** February 2026
**Author:** Project Handover Documentation

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Technology Stack](#3-technology-stack)
4. [Database Schema](#4-database-schema)
5. [API Reference](#5-api-reference)
6. [Authentication System](#6-authentication-system)
7. [Game Logic](#7-game-logic)
8. [Frontend Components](#8-frontend-components)
9. [Admin System](#9-admin-system)
10. [Environment Configuration](#10-environment-configuration)
11. [Development Setup](#11-development-setup)
12. [Deployment Guide](#12-deployment-guide)
13. [Known Issues & Future Work](#13-known-issues--future-work)

---

## 1. Project Overview

### 1.1 Description

6-7 Numbers is a web-based implementation of the "Numbers Round" from the British TV game show Countdown. Players are given 6 number tiles and must use arithmetic operations to reach a randomly generated target number.

### 1.2 Key Features

- **Daily Challenges**: A new puzzle every day at midnight UTC, shared globally
- **Random Challenges**: Play unlimited random frames with friend matching (registered users only)
- **User Accounts**: Registration with email verification, secure authentication
- **Pre-game Gate**: New visitors see a blurred game with "Sign In" / "Play as Guest" overlay
- **Countdown Animation**: 3-second countdown (3, 2, 1) before game reveals and timer starts
- **Client-side Timing**: Duration tracked client-side to hundredths of a second
- **Points System**: Automatic daily points calculation based on difficulty and solve time
- **Friends System**: Add friends by email, compete on shared frames
- **Dashboard**: Challenge history calendar, per-challenge and overall leaderboards, friends activity
- **Admin Dashboard**: Manage and preview daily challenges, trigger points recalculation
- **Route Protection**: Non-authenticated users can only access the daily challenge page

### 1.3 Access Rules

- **Anonymous users**: Can only see/play the daily challenge (as guest). Cannot submit results, access dashboard, or play random/historical challenges.
- **Registered users**: Full access to dashboard, random challenges, historical challenges, friends, leaderboards.
- **Completed challenges**: Tiles for solved daily challenges are non-clickable in the calendar. Unsolved attempts remain playable.

### 1.3 Game Rules

1. 6 number tiles are provided (typically 2 large + 4 small)
2. Large numbers: 25, 50, 75, 100 (no duplicates)
3. Small numbers: 1-10 (can repeat)
4. Target number: Random integer between 101-999
5. Operations allowed: Addition (+), Subtraction (-), Multiplication (×), Division (÷)
6. Each tile can only be used once
7. Intermediate results must be positive integers
8. 60-second countdown timer (game continues into "overtime" after)

---

## 2. Architecture

### 2.1 System Architecture

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│                 │         │                 │         │                 │
│  React Client   │◄───────►│  Express API    │◄───────►│   PostgreSQL    │
│  (Vite)         │  HTTP   │  (Node.js)      │  Prisma │   Database      │
│  Port: 5173     │  REST   │  Port: 3001     │         │                 │
│                 │         │                 │         │                 │
└─────────────────┘         └─────────────────┘         └─────────────────┘
```

### 2.2 Directory Structure

```
countdown/
├── client/                      # React frontend
│   ├── src/
│   │   ├── App.tsx             # Main game component
│   │   ├── App.css             # Game styling
│   │   ├── api.ts              # API client & types
│   │   ├── main.tsx            # Entry point
│   │   └── components/
│   │       ├── AuthForm.tsx    # Login/Register/Forgot Password
│   │       ├── Profile.tsx     # User profile & friends
│   │       ├── ResetPasswordForm.tsx
│   │       └── Admin.tsx       # Admin dashboard
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── package.json
│
├── server/                      # Express backend
│   ├── src/
│   │   ├── index.ts            # Server entry point
│   │   ├── db.ts               # Prisma client setup
│   │   ├── middleware/
│   │   │   └── auth.ts         # JWT authentication
│   │   ├── routes/
│   │   │   ├── auth.ts         # Authentication endpoints
│   │   │   ├── game.ts         # Game/challenge endpoints
│   │   │   ├── friends.ts      # Friend management
│   │   │   └── admin.ts        # Admin endpoints
│   │   └── services/
│   │       ├── frameGenerator.ts   # Game frame generation
│   │       └── expressionValidator.ts
│   ├── prisma/
│   │   ├── schema.prisma       # Database schema
│   │   └── migrations/         # Database migrations
│   ├── package.json
│   └── .env                    # Environment variables
│
└── TECHNICAL_SPECIFICATION.md  # This document
```

### 2.3 Data Flow

**Game Phase State Machine (App.tsx):**
```
'loading' → fetch daily data
    │
    ├── Anonymous user → 'pre-game' (blurred game + Sign In / Play as Guest overlay)
    ├── Signed in, not played → 'countdown' (3-2-1 animation)
    └── Already solved → 'playing' (show solved state)

'pre-game' → user clicks Sign In or Play as Guest → 'countdown'
'countdown' → 3-second animation → 'playing' (timer starts, serverStartTime set)
```

**Daily Challenge Flow:**
```
User visits site → GET /api/game/daily
    ├── Find Frame for today's date
    ├── If logged in: check for existing GameResult → return previousResult
    └── Return frame data
        │
        ▼
    Game phase gate (pre-game / countdown / playing)
        │
        ▼
    User plays game → POST /api/game/frame/:id/submit
        ├── Client sends duration (hundredths precision)
        ├── Check if solved (result === target)
        └── Create/update GameResult record
```

**Logout Flow:**
```
User clicks Sign Out
    ├── Clear auth token and user state
    ├── Navigate to home route
    ├── Reload daily challenge (initializeGame)
    └── Show pre-game overlay (anonymous state)
```

**Points Calculation (runs on server startup + daily at midnight UTC):**
```
For each solved daily challenge GameResult:
    Base points = 100 - completion% (harder = more points)
    Multiplier: <60s = 1.2x, <5min = 1.1x, else 1.0x
    → Upsert UserStats with total points per user
```

---

## 3. Technology Stack

### 3.1 Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 18.x | UI framework |
| TypeScript | 5.x | Type safety |
| Vite | 5.x | Build tool & dev server |
| CSS | - | Styling (no framework) |

### 3.2 Backend

| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js | 20.x | Runtime environment |
| Express | 4.x | Web framework |
| TypeScript | 5.x | Type safety |
| Prisma | 6.x | ORM |
| PostgreSQL | 15.x | Database |
| JWT | - | Authentication tokens |
| bcrypt | - | Password hashing |

### 3.3 Dependencies

**Server (key dependencies):**
- `express`: Web framework
- `@prisma/client`: Database ORM
- `@prisma/adapter-pg`: PostgreSQL adapter
- `jsonwebtoken`: JWT creation/verification
- `bcrypt`: Password hashing (12 rounds)
- `cors`: Cross-origin requests
- `dotenv`: Environment configuration

**Client (key dependencies):**
- `react`: UI framework
- `react-dom`: DOM rendering
- `typescript`: Type checking

---

## 4. Database Schema

### 4.1 Entity Relationship Diagram

```
┌──────────────────┐
│      User        │
├──────────────────┤
│ id (PK)          │
│ email (unique)   │
│ hashedPassword   │
│ name             │
│ emailVerified    │
│ createdAt        │
└────────┬─────────┘
         │
    ┌────┴────┬────────────┬─────────────┬──────────────┐
    │         │            │             │              │
    ▼         ▼            ▼             ▼              ▼
┌────────┐ ┌─────────┐ ┌─────────┐ ┌───────────┐ ┌───────────┐
│GameResult│ │DailyAttempt│ │Friendship│ │Verification│ │Password  │
│         │ │           │ │          │ │Token      │ │ResetToken│
└────┬────┘ └─────┬─────┘ └──────────┘ └───────────┘ └───────────┘
     │            │
     └─────┬──────┘
           ▼
    ┌──────────────┐
    │    Frame     │
    ├──────────────┤
    │ id (PK)      │
    │ tiles[]      │
    │ targetNumber │
    │ date (unique)│
    │ isManual     │
    │ createdAt    │
    └──────────────┘
```

### 4.2 Model Details

#### User
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | String | PK, CUID | Unique identifier |
| email | String | Unique | Login email |
| hashedPassword | String | Required | bcrypt hash |
| name | String | Optional | Display name |
| emailVerified | Boolean | Default: false | Verification status |
| createdAt | DateTime | Default: now() | Registration time |

#### Frame
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | String | PK, CUID | Unique identifier |
| tiles | Int[] | Required | 6 number tiles |
| targetNumber | Int | Required | Target (101-999) |
| date | DateTime | Unique, Optional | Daily challenge date |
| isManual | Boolean | Default: false | Admin-created flag |
| createdAt | DateTime | Default: now() | Creation time |

#### GameResult
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | String | PK, CUID | Unique identifier |
| expression | String | Optional | Solution expression |
| result | Int | Optional | Calculated result |
| solved | Boolean | Default: false | Success flag |
| duration | Int | Optional | Time in seconds |
| playedAt | DateTime | Default: now() | Submission time |
| userId | String | FK, Optional | User reference |
| frameId | String | FK, Required | Frame reference |

#### DailyAttempt
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | String | PK, CUID | Unique identifier |
| startedAt | DateTime | Default: now() | Start time |
| userId | String | FK, Required | User reference |
| frameId | String | FK, Required | Frame reference |
| | | @@unique([userId, frameId]) | One per user/frame |

#### Friendship
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | String | PK, CUID | Unique identifier |
| status | Enum | PENDING/ACCEPTED | Relationship status |
| createdAt | DateTime | Default: now() | Request time |
| userId | String | FK, Required | Sender reference |
| friendId | String | FK, Required | Receiver reference |
| | | @@unique([userId, friendId]) | One per pair |

---

## 5. API Reference

### 5.1 Authentication Endpoints

#### POST /api/auth/register
Creates a new user account.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "secret123",
  "name": "John Doe"  // optional
}
```

**Response (201):**
```json
{
  "message": "Account created. Please check your email to verify your account.",
  "requiresVerification": true
}
```

#### POST /api/auth/login
Authenticates a user.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "secret123"
}
```

**Response (200):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "clxyz...",
    "email": "user@example.com",
    "name": "John Doe"
  }
}
```

#### POST /api/auth/verify
Verifies email with token.

**Request:**
```json
{
  "token": "64-char-hex-string"
}
```

**Response (200):**
```json
{
  "message": "Email verified successfully",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": { "id": "...", "email": "...", "name": "..." }
}
```

#### POST /api/auth/forgot-password
Initiates password reset.

**Request:**
```json
{
  "email": "user@example.com"
}
```

**Response (200):**
```json
{
  "message": "If an account exists with this email, a password reset link has been sent."
}
```

#### POST /api/auth/reset-password
Resets password with token.

**Request:**
```json
{
  "token": "64-char-hex-string",
  "newPassword": "newsecret123"
}
```

**Response (200):**
```json
{
  "message": "Password has been reset successfully"
}
```

#### GET /api/auth/me
Gets current user (requires auth).

**Response (200):**
```json
{
  "user": {
    "id": "...",
    "email": "...",
    "name": "...",
    "emailVerified": true,
    "createdAt": "2024-01-15T..."
  }
}
```

#### PATCH /api/auth/me
Updates user profile (requires auth).

**Request:**
```json
{
  "name": "New Name"
}
```

#### POST /api/auth/change-password
Changes password (requires auth).

**Request:**
```json
{
  "currentPassword": "oldpassword",
  "newPassword": "newpassword"
}
```

### 5.2 Game Endpoints

#### GET /api/game/daily
Gets today's daily challenge.

**Response (200):**
```json
{
  "frame": {
    "id": "clxyz...",
    "tiles": [25, 50, 3, 7, 2, 8],
    "targetNumber": 527,
    "date": "2024-01-15T00:00:00.000Z"
  },
  "startedAt": "2024-01-15T10:30:00.000Z",  // or null
  "previousResult": null  // or { solved, duration, result }
}
```

#### POST /api/game/random
Generates a random frame for the user to play (requires auth).

**Smart Friend Matching:**
Before generating a new frame, the system checks for unplayed random frames
created by the user's friends (limited to 100 most recent). If found, one is
randomly selected to build organic competition. Otherwise, a new unique frame
is generated.

**Uniqueness:**
New frames are checked against ALL existing frames (daily and random) to
ensure no duplicate tile/target combinations.

**Response (200):**
```json
{
  "frame": {
    "id": "clxyz...",
    "tiles": [75, 100, 4, 6, 1, 9],
    "targetNumber": 312
  },
  "startedAt": "2026-02-07T12:00:00.000Z"
}
```

**Note:** `startedAt` is used for server-side duration calculation, same as daily challenges.

#### GET /api/game/frame/:id
Gets a specific frame.

**Response (200):**
```json
{
  "frame": {
    "id": "clxyz...",
    "tiles": [...],
    "targetNumber": 527,
    "date": "..."
  }
}
```

#### POST /api/game/frame/:id/submit
Submits a solution (requires auth).

**Authentication:** Required. Unauthenticated users are prompted to sign in.

**Duration Calculation:** Server-side timing from DailyAttempt record for both
daily AND random frames. Prevents client-side timer manipulation.

**Request:**
```json
{
  "expression": "(25 + 50) * 7",
  "result": 525
}
```

**Response (200):**
```json
{
  "success": true,
  "result": 525,
  "solved": false,
  "duration": 45
}
```

### 5.3 Friends Endpoints

All require authentication.

#### GET /api/friends
Lists all friends and requests.

**Response (200):**
```json
{
  "friends": [
    {
      "id": "clxyz...",
      "status": "ACCEPTED",
      "direction": "sent",
      "user": { "id": "...", "email": "...", "name": "..." },
      "createdAt": "..."
    }
  ]
}
```

#### POST /api/friends/request
Sends a friend request.

**Request:**
```json
{
  "email": "friend@example.com"
}
```

#### POST /api/friends/:id/accept
Accepts a friend request.

#### DELETE /api/friends/:id
Removes friend or cancels request.

### 5.4 Admin Endpoints

All require admin authentication.

#### POST /api/admin/login
Admin login.

**Request:**
```json
{
  "username": "admin",
  "password": "admin123"
}
```

#### GET /api/admin/challenges
Lists challenges (15 days past to 15 days future).

**Response (200):**
```json
{
  "challenges": [
    {
      "id": "...",
      "date": "2024-01-15T00:00:00.000Z",
      "tiles": [25, 50, 3, 7, 2, 8],
      "targetNumber": 527,
      "isManual": false,
      "playCount": 150,
      "successRate": 73,
      "createdAt": "..."
    }
  ]
}
```

#### PUT /api/admin/challenges/:date
Creates or updates a challenge.

**Request (Manual):**
```json
{
  "tiles": [25, 50, 1, 2, 3, 4],
  "targetNumber": 500
}
```

**Request (Random):**
```json
{
  "generateRandom": true
}
```

---

## 6. Authentication System

### 6.1 User Authentication Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Register  │────►│   Verify    │────►│    Login    │
│             │     │   Email     │     │             │
└─────────────┘     └─────────────┘     └─────────────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │  JWT Token  │
                                        │  (7 days)   │
                                        └─────────────┘
```

### 6.2 JWT Token Structure

**User Token:**
- Payload: `{ userId: string }`
- Expiration: 7 days
- Secret: `JWT_SECRET` environment variable

**Admin Token:**
- Payload: `{ isAdmin: true }`
- Expiration: 8 hours
- Secret: `ADMIN_JWT_SECRET` environment variable

### 6.3 Password Security

- Hashing: bcrypt with cost factor 12
- Minimum length: 6 characters
- Stored as `hashedPassword` in User model

### 6.4 Email Verification

1. User registers → Account created with `emailVerified: false`
2. System generates 64-character hex token (24h expiry)
3. Verification link logged to console (dev) or emailed (production)
4. User clicks link → Token validated → `emailVerified: true`
5. User receives JWT and is logged in

### 6.5 Password Reset

1. User requests reset → Token generated (1h expiry)
2. Reset link logged to console (dev) or emailed (production)
3. User clicks link → Enters new password
4. Password updated, token deleted

---

## 7. Game Logic

### 7.1 Frame Generation

**Tile Selection Algorithm:**
```typescript
function generateTiles(): number[] {
  const tiles: number[] = [];

  // 2 large numbers WITHOUT replacement
  const largePool = [25, 50, 75, 100];
  for (let i = 0; i < 2; i++) {
    const index = Math.floor(Math.random() * largePool.length);
    tiles.push(largePool.splice(index, 1)[0]);
  }

  // 4 small numbers WITH replacement
  const smallPool = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  for (let i = 0; i < 4; i++) {
    const index = Math.floor(Math.random() * smallPool.length);
    tiles.push(smallPool[index]);
  }

  // Fisher-Yates shuffle
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }

  return tiles;
}
```

**Target Generation:**
- Range: 101 to 999 (inclusive)
- Formula: `Math.floor(Math.random() * 899) + 101`

### 7.2 Uniqueness Checking

Daily challenges are checked for uniqueness:
1. Sort tiles (order-independent comparison)
2. Compare against all frames with same target
3. Reject if tiles match (when sorted)

### 7.3 Timing System

**Server-Side Timing:**
1. User requests daily challenge → `DailyAttempt.startedAt` recorded
2. User submits solution → Duration calculated: `now - startedAt`
3. Duration stored in `GameResult.duration` (seconds)

**Frontend Timer:**
- Syncs with `startedAt` from server response
- 60-second countdown display
- Continues into "overtime" (60++ seconds)

### 7.4 Frontend Game State

```typescript
type Row = {
  num1: TileState;      // First operand
  operator: TileState;  // +, -, ×, /
  num2: TileState;      // Second operand
  result: TileState;    // Calculated result
};

type TileState = {
  value: string;
  filled: boolean;
  active: boolean;
};

type KeyState = {
  value: string;
  used: boolean;      // Already used in a row
  inactive: boolean;  // Cannot be selected
};
```

### 7.5 Calculation Rules

- Subtraction: `num2 < num1` (result must be positive)
- Division: `num1 % num2 === 0` (result must be integer)
- Results become available as new "keys" for subsequent rows

---

## 8. Frontend Components

### 8.1 Component Hierarchy

```
App
├── UserBar (Sign In / Profile / Sign Out)
├── AuthForm (Modal)
│   ├── Login mode
│   ├── Register mode
│   └── Forgot Password mode
├── ResetPasswordForm (Modal)
├── Profile (Modal)
│   ├── Update Name
│   ├── Change Password
│   └── Friends Management
├── TargetDisplay (3-digit target)
├── Timer
├── Alert (inline error messages)
├── Victory Modal
├── GameGrid (5 calculation rows)
│   └── Row (num1, operator, num2, result, delete)
└── Keyboard
    ├── Initial Tiles (6)
    ├── Calculated Results (4)
    ├── Reset Button
    └── Operators (+, -, ×, /)
```

### 8.2 State Management

All state is managed via React hooks in `App.tsx`:

| State | Type | Purpose |
|-------|------|---------|
| target | number | Target number to reach |
| rows | Row[] | 5 calculation rows |
| initCards | KeyState[] | Initial 6 tiles |
| calculatedKeys | KeyState[] | Results from calculations |
| currentBest | number | Closest result to target |
| activePosition | {row, type} | Current input position |
| gameWon | boolean | Win state |
| timer | number | Elapsed seconds |
| user | User \| null | Logged-in user |
| frame | Frame \| null | Current game frame |

### 8.3 API Client

Located in `client/src/api.ts`:

```typescript
// Token management
setToken(token: string): void
clearToken(): void
isLoggedIn(): boolean

// API namespaces
gameApi: {
  getDaily(): Promise<DailyResponse>
  getRandom(): Promise<{frame: Frame}>
  getFrame(id: string): Promise<{frame: Frame}>
  submit(frameId, expression, duration, result): Promise<SubmitResponse>
}

authApi: {
  register(email, password, name?): Promise<RegisterResponse>
  login(email, password): Promise<AuthResponse>
  verify(token): Promise<VerifyResponse>
  forgotPassword(email): Promise<{message: string}>
  resetPassword(token, newPassword): Promise<{message: string}>
  me(): Promise<{user: User}>
  updateProfile(name): Promise<{user: User}>
  changePassword(currentPassword, newPassword): Promise<{message: string}>
}

friendsApi: {
  list(): Promise<{friends: Friend[]}>
  sendRequest(email): Promise<{friend: Friend}>
  acceptRequest(id): Promise<{friend: Friend}>
  remove(id): Promise<{message: string}>
}

adminApi: {
  login(username, password): Promise<{token: string}>
  verify(): Promise<{valid: boolean}>
  listChallenges(): Promise<{challenges: Challenge[]}>
  saveChallenge(date, data): Promise<{challenge: Challenge, created: boolean}>
}
```

### 8.4 Design System — Color Variables

All colors are defined as CSS custom properties in the `:root` block at the top of `client/src/App.css`. **Never use hardcoded color values** — always reference a variable.

#### Brand

| Variable | Value | Usage |
|---|---|---|
| `--yellow` | `#f2d73a` | Logo, primary buttons, init keys, calc keys, target tile |
| `--yellow-hover` | `#e6cb35` | Hover state for yellow elements |
| `--yellow-glow` | `rgba(242, 215, 58, 0.4)` | Text-shadow glow on countdown / victory screen |
| `--yellow-bg-tint` | `rgba(242, 215, 58, 0.15)` | Subtle yellow background tint |
| `--dark` | `#283033` | Primary dark text and backgrounds |
| `--blue` | `hsl(198, 80%, 52%)` | Operator keys, overtime timer, secondary buttons |
| `--blue-hover` | `hsl(198, 80%, 44%)` | Hover state for blue elements |
| `--blue-light` | `hsl(198, 80%, 92%)` | Blue badge background |
| `--blue-dark-text` | `hsl(198, 80%, 30%)` | Blue badge text |
| `--orange` | `#FFA239` | Initial number keys |

#### Semantic

| Variable | Value | Usage |
|---|---|---|
| `--red` | `#f44336` | Errors, delete button |
| `--red-dark` | `#c62828` | Dark red variant |
| `--red-darker` | `#d32f2f` | Hover red |
| `--green` | `#4caf50` | Success states |
| `--green-hover` | `#43a047` | Green hover |
| `--green-dark` | `#2e7d32` | Dark green variant |

#### Dark theme

| Variable | Value | Usage |
|---|---|---|
| `--bg-dark` | `#1e2225` | Main dark panel background |
| `--bg-panel` | `#2a2a2a` | Dark tile/card background |
| `--tile-border` | `hsl(56, 20%, 40%)` | Game tile border color |

#### Dashboard — difficulty bars

| Variable | Value |
|---|---|
| `--diff-easy` | `#4ade80` |
| `--diff-medium` | `#fbbf24` |
| `--diff-hard` | `#fb923c` |
| `--diff-very-hard` | `#f87171` |

#### Dashboard — challenge tile status

| Variable | Value | Usage |
|---|---|---|
| `--status-solved` | `#16a34a` | Solved tile top strip |
| `--status-failed` | `#dc2626` | Failed tile top strip |

#### Banners / feedback

| Variable | Value | Usage |
|---|---|---|
| `--warning-bg` | `#fff8e1` | Warning banner background |
| `--warning-border` | `#ffcc02` | Warning banner border |
| `--warning-text` | `#5d4e00` | Warning banner text |
| `--error-bg` | `#ffebee` | Error banner background |
| `--error-bg-dark` | `#ffcdd2` | Error banner border/accent |
| `--success-bg` | `#e8f5e9` | Success banner background |

#### Score / leaderboard

| Variable | Value | Usage |
|---|---|---|
| `--score-orange` | `#ffb74d` | Near-miss score color |
| `--score-green` | `#81c784` | Good score color |
| `--score-red` | `#ef9a9a` | Poor score color |
| `--score-red-bright` | `#ff6b6b` | Fail indicator |

#### Grays

| Variable | Value |
|---|---|
| `--gray-lightest` | `#fafafa` |
| `--gray-lighter` | `#f5f5f5` |
| `--gray-light` | `#f0f0f0` |
| `--gray-eee` | `#eee` |
| `--gray-ddd` | `#ddd` |
| `--gray-ccc` | `#ccc` |
| `--gray-aaa` | `#aaa` |
| `--gray-999` | `#999` |
| `--gray-888` | `#888` |
| `--gray-666` | `#666` |
| `--gray-333` | `#333` |
| `--gray-222` | `#222` |

---

## 9. Admin System

### 9.1 Admin Access

- Separate login at `/admin`
- Credentials via environment variables
- Separate JWT token storage (`admin_token`)

### 9.2 Capabilities

1. **View Challenges**: 30-day window (15 past, 15 future)
2. **Edit Future Challenges**: Cannot edit today or past
3. **Manual Entry**: Set specific tiles and target
4. **Random Generation**: Generate unique random values
5. **Statistics**: View play count and success rate

### 9.3 Validation Rules

Manual challenges must pass:
- Exactly 6 tiles
- All positive integers
- Max 2 tiles > 10 (large numbers)
- Target: 101-999
- Unique tile/target combination

---

## 10. Environment Configuration

### 10.1 Server Environment Variables

Create `server/.env`:

```env
# Database
DATABASE_URL="postgresql://user:password@host:5432/database"

# JWT Secrets (MUST change in production)
JWT_SECRET="your-secret-key-at-least-32-chars"
ADMIN_JWT_SECRET="admin-secret-key-at-least-32-chars"

# Admin Credentials (MUST change in production)
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="secure-admin-password"

# Frontend URL (for email links)
FRONTEND_URL="http://localhost:5173"

# Server Port
PORT=3001
```

### 10.2 Client Configuration

The API URL is hardcoded in `client/src/api.ts`:
```typescript
const API_URL = 'http://localhost:3001/api';
```

For production, update this to your production API URL.

---

## 11. Development Setup

### 11.1 Prerequisites

- Node.js 20.x or later
- PostgreSQL 15.x or later
- npm or yarn

### 11.2 Initial Setup

```bash
# Clone repository
git clone <repository-url>
cd countdown

# Install server dependencies
cd server
npm install

# Configure environment
cp .env.example .env
# Edit .env with your database credentials

# Run database migrations
npx prisma migrate dev

# Generate Prisma client
npx prisma generate

# Install client dependencies
cd ../client
npm install
```

### 11.3 Running Development Servers

```bash
# Terminal 1: Start server
cd server
npm run dev

# Terminal 2: Start client
cd client
npm run dev
```

### 11.4 Database Commands

```bash
# Create migration
npx prisma migrate dev --name migration_name

# Apply migrations
npx prisma migrate deploy

# Reset database
npx prisma migrate reset

# Open Prisma Studio (database GUI)
npx prisma studio
```

---

## 12. Deployment Guide

### 12.1 Production Checklist

- [ ] Set strong `JWT_SECRET` and `ADMIN_JWT_SECRET`
- [ ] Set secure admin credentials
- [ ] Configure `DATABASE_URL` for production database
- [ ] Update `FRONTEND_URL` to production domain
- [ ] Update client `API_URL` to production API
- [ ] Configure CORS for production domain
- [ ] Set up email service for verification/reset emails
- [ ] Configure HTTPS
- [ ] Set up database backups
- [ ] Configure rate limiting
- [ ] Enable logging/monitoring

### 12.2 CORS Configuration

Update `server/src/index.ts`:
```typescript
app.use(cors({
  origin: 'https://yourdomain.com',
  credentials: true,
}));
```

### 12.3 Email Service Integration

Currently, verification and reset links are logged to console. For production:

1. Choose an email service (SendGrid, AWS SES, etc.)
2. Modify the following files to send actual emails:
   - `server/src/routes/auth.ts` - Registration verification
   - `server/src/routes/auth.ts` - Password reset
   - `server/src/routes/auth.ts` - Resend verification

---

## 13. Known Issues & Future Work

### 13.1 Known Limitations

1. **Email Delivery**: Currently logs to console; needs email service
2. **Rate Limiting**: No rate limiting on auth endpoints
3. **Input Validation**: Client-side validation only for game moves
4. **Mobile Optimization**: Basic responsive design

### 13.2 Recommended Improvements

1. **Email Service**: Integrate SendGrid or similar
2. **Rate Limiting**: Add express-rate-limit middleware
3. **Server-Side Validation**: Validate tile usage on submission
4. **Accessibility**: Screen reader support, keyboard navigation
5. **PWA**: Add service worker for offline capability
6. **Testing**: Add unit and integration tests

### 13.3 Recently Implemented Features

1. **Per-Frame Leaderboards**: Global and friends-only rankings per frame
2. **Multi-tier Ranking**: Sorted by solved → closest to target → fastest time
3. **Random Frame Challenges**: Unlimited random frames with friend matching
4. **Dashboard**: Challenge history calendar, leaderboards, friends activity
5. **Auth-Required Submissions**: Prevents anonymous submissions, prompts sign-in
6. **Post-Solve Redirect**: Auto-redirect to dashboard after completing daily

### 13.3 Security Considerations

1. Implement rate limiting on authentication endpoints
2. Add CAPTCHA for registration
3. Consider 2FA for admin access
4. Audit logging for admin actions
5. Input sanitization for all user inputs
6. Regular dependency updates

---

## Appendix A: Quick Reference

### API Endpoints Summary

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | /api/auth/register | - | Register |
| POST | /api/auth/login | - | Login |
| POST | /api/auth/verify | - | Verify email |
| POST | /api/auth/forgot-password | - | Request reset |
| POST | /api/auth/reset-password | - | Reset password |
| GET | /api/auth/me | User | Get profile |
| PATCH | /api/auth/me | User | Update profile |
| POST | /api/auth/change-password | User | Change password |
| GET | /api/game/daily | Optional | Get daily challenge |
| POST | /api/game/random | User | Generate random |
| GET | /api/game/frame/:id | Optional | Get frame |
| POST | /api/game/frame/:id/submit | Optional | Submit solution |
| GET | /api/friends | User | List friends |
| POST | /api/friends/request | User | Send request |
| POST | /api/friends/:id/accept | User | Accept request |
| DELETE | /api/friends/:id | User | Remove friend |
| POST | /api/admin/login | - | Admin login |
| GET | /api/admin/challenges | Admin | List challenges |
| PUT | /api/admin/challenges/:date | Admin | Save challenge |

### Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request / Validation Error |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 500 | Server Error |

---

*Document generated for project handover. For questions, refer to the inline code comments or contact the original development team.*
