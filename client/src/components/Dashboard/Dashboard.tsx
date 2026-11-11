/**
 * =============================================================================
 * DASHBOARD PAGE (Dashboard/Dashboard.tsx)
 * =============================================================================
 *
 * Four tabs shown as a segmented control (they fit at phone width, so no
 * burger menu): Daily (shortcuts + calendar), Ranks (all-time points), Stats, History.
 * A dock at the bottom always offers today's daily and a random frame.
 * Accessible at /dashboard route.
 *
 * @module client/components/Dashboard/Dashboard
 */

import { useState, useEffect } from 'react';
import ChallengeCalendar from './ChallengeCalendar';
import Leaderboard from './Leaderboard';
import PlayHistory from './PlayHistory';
import Stats from './Stats';
import Shortcuts from './Shortcuts';
import PlayerSheet from './PlayerSheet';
import { gameApi, PreviousResult } from '../../api';
import './Dashboard.css';

interface DashboardProps {
  onNavigateHome: () => void;
  onPlayFrame: (frameId: string, frameName?: string) => void;
  onPlayRandom: () => void;
  /** Open on this frame's leaderboard (e.g. from a shared link's challenge card) */
  initialFrameId?: string | null;
}

type TabType = 'daily' | 'leaderboard' | 'stats' | 'history';

const TABS: { id: TabType; label: string }[] = [
  { id: 'daily', label: 'Daily' },
  { id: 'leaderboard', label: 'Ranks' },
  { id: 'stats', label: 'Stats' },
  { id: 'history', label: 'History' },
];

/**
 * Calculate hours until next daily challenge (midnight UTC).
 */
function getHoursUntilTomorrow(): number {
  const now = new Date();
  const tomorrow = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0, 0, 0, 0
  ));
  return Math.ceil((tomorrow.getTime() - now.getTime()) / (1000 * 60 * 60));
}

export default function Dashboard({ onNavigateHome, onPlayFrame, onPlayRandom, initialFrameId = null }: DashboardProps) {
  const [activeTab, setActiveTab] = useState<TabType>('daily');
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(initialFrameId);
  const [dailyStatus, setDailyStatus] = useState<PreviousResult | null | undefined>(undefined);
  const [hoursUntilTomorrow, setHoursUntilTomorrow] = useState(getHoursUntilTomorrow());
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [compareWith, setCompareWith] = useState<{ id: string; name: string } | null>(null);

  // Fetch daily challenge status on mount
  useEffect(() => {
    gameApi.getDaily()
      .then(response => setDailyStatus(response.previousResult))
      .catch(() => setDailyStatus(null));
  }, []);

  // Update countdown every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setHoursUntilTomorrow(getHoursUntilTomorrow());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Per-day leaderboard opens inside the Daily tab, with a back link to the calendar
  const handleSelectFrame = (frameId: string) => {
    setSelectedFrameId(frameId);
    setActiveTab('daily');
  };

  const selectTab = (tab: TabType) => {
    setActiveTab(tab);
    setSelectedFrameId(null);
    setCompareWith(null);
  };

  // Your own name goes to your Stats tab; anyone else's opens their sheet
  const handleSelectPlayer = (id: string, isMe: boolean) => {
    if (isMe) selectTab('stats');
    else setPlayerId(id);
  };

  const handleCompare = (player: { id: string; name: string }) => {
    setPlayerId(null);
    setSelectedFrameId(null);
    setCompareWith(player);
    setActiveTab('stats');
  };

  const getChallengeButtonText = (): string => {
    if (dailyStatus === undefined) return 'Loading...';
    if (dailyStatus === null) return "Play today's daily";
    if (dailyStatus.solved === true) return `Next daily in ${hoursUntilTomorrow}h`;
    if (dailyStatus.result !== null) return "Try today's daily again";
    return "Play today's daily";
  };

  const isChallengeButtonDisabled = dailyStatus?.solved === true;

  return (
    <div className="dashboard-page">
      <nav className="seg dash-tabs" role="tablist">
        {TABS.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? 'on' : ''}
            onClick={() => selectTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="dashboard-content">
        {activeTab === 'daily' && !selectedFrameId && <Shortcuts onPlayFrame={onPlayFrame} />}
        {activeTab === 'daily' && !selectedFrameId && (
          <ChallengeCalendar
            onSelectFrame={handleSelectFrame}
            onPlayFrame={onPlayFrame}
          />
        )}
        {activeTab === 'daily' && selectedFrameId && (
          <>
            <button className="back-btn" onClick={() => setSelectedFrameId(null)}>
              ← Calendar
            </button>
            <Leaderboard
              frameId={selectedFrameId}
              onSelectFrame={setSelectedFrameId}
              onSelectPlayer={handleSelectPlayer}
            />
          </>
        )}
        {activeTab === 'leaderboard' && (
          <Leaderboard
            frameId={null}
            onSelectFrame={setSelectedFrameId}
            onSelectPlayer={handleSelectPlayer}
          />
        )}
        {/* Keyed so arriving from a player sheet reloads the comparison */}
        {activeTab === 'stats' && <Stats key={compareWith?.id ?? 'me'} compareWith={compareWith} />}
        {activeTab === 'history' && (
          <PlayHistory onPlayFrame={onPlayFrame} onSelectFrame={handleSelectFrame} />
        )}
      </main>

      {playerId && (
        <PlayerSheet playerId={playerId} onCompare={handleCompare} onClose={() => setPlayerId(null)} />
      )}

      <div className="dock">
        <button
          className="btn ink grow"
          onClick={onNavigateHome}
          disabled={isChallengeButtonDisabled}
        >
          {getChallengeButtonText()}
        </button>
        <button className="btn line" onClick={onPlayRandom}>
          Random
        </button>
      </div>
    </div>
  );
}
