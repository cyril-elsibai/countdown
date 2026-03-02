/**
 * =============================================================================
 * DASHBOARD PAGE (Dashboard/Dashboard.tsx)
 * =============================================================================
 *
 * Main dashboard page with tabs for history calendar, leaderboards,
 * and friends activity. Accessible at /dashboard route.
 *
 * @module client/components/Dashboard/Dashboard
 */

import { useState, useEffect } from 'react';
import ChallengeCalendar from './ChallengeCalendar';
import Leaderboard from './Leaderboard';
import FriendsActivity from './FriendsActivity';
import { gameApi, PreviousResult } from '../../api';
import './Dashboard.css';

interface DashboardProps {
  onNavigateHome: () => void;
  onPlayFrame: (frameId: string) => void;
  onPlayRandom: () => void;
}

type TabType = 'history' | 'leaderboard' | 'friends';

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

export default function Dashboard({ onNavigateHome, onPlayFrame, onPlayRandom }: DashboardProps) {
  const [activeTab, setActiveTab] = useState<TabType>('history');
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null);
  const [dailyStatus, setDailyStatus] = useState<PreviousResult | null | undefined>(undefined);
  const [hoursUntilTomorrow, setHoursUntilTomorrow] = useState(getHoursUntilTomorrow());

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

  const handleSelectFrame = (frameId: string) => {
    setSelectedFrameId(frameId);
    setActiveTab('history'); // stays on history tab, shows inline leaderboard
  };

  const handleBackToHistory = () => {
    setSelectedFrameId(null);
  };

  // Determine button text and disabled state
  const getChallengeButtonText = (): string => {
    if (dailyStatus === undefined) return 'Loading...';
    if (dailyStatus === null) return "Play today's challenge";
    if (dailyStatus.solved === true) {
      return `Tomorrow's challenge in ${hoursUntilTomorrow}h`;
    }
    if (dailyStatus.result !== null) {
      return "Try today's challenge again";
    }
    return "Play today's challenge";
  };

  const isChallengeButtonDisabled = dailyStatus?.solved === true;

  return (
    <div className="dashboard-page">
      <div className="dashboard-container">
        {/* Desktop tabs */}
        <nav className="dashboard-tabs desktop-only">
          <button
            className={`dashboard-tab ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => { setActiveTab('history'); setSelectedFrameId(null); }}
          >
            Challenge History
          </button>
          <button
            className={`dashboard-tab ${activeTab === 'leaderboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('leaderboard')}
          >
            Main Leaderboard
          </button>
          <button
            className={`dashboard-tab ${activeTab === 'friends' ? 'active' : ''}`}
            onClick={() => setActiveTab('friends')}
          >
            Friends Activity
          </button>
        </nav>

        {/* Mobile menu */}
        <div className="mobile-menu-bar mobile-only">
          <span className="mobile-active-tab">
            {activeTab === 'history' ? 'Challenge History' : activeTab === 'leaderboard' ? 'Main Leaderboard' : 'Friends Activity'}
          </span>
          <button className="burger-btn" onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? '\u2715' : '\u2630'}
          </button>
        </div>
        {menuOpen && (
          <div className="burger-overlay mobile-only" onClick={() => setMenuOpen(false)} />
        )}
        {menuOpen && (
          <div className="burger-menu mobile-only">
            <button
              className={activeTab === 'history' ? 'active' : ''}
              onClick={() => { setActiveTab('history'); setSelectedFrameId(null); setMenuOpen(false); }}
            >
              Challenge History
            </button>
            <button
              className={activeTab === 'leaderboard' ? 'active' : ''}
              onClick={() => { setActiveTab('leaderboard'); setMenuOpen(false); }}
            >
              Main Leaderboard
            </button>
            <button
              className={activeTab === 'friends' ? 'active' : ''}
              onClick={() => { setActiveTab('friends'); setMenuOpen(false); }}
            >
              Friends Activity
            </button>
          </div>
        )}

        <main className="dashboard-content">
          {activeTab === 'history' && !selectedFrameId && (
            <ChallengeCalendar
              onSelectFrame={handleSelectFrame}
              onPlayFrame={onPlayFrame}
            />
          )}
          {activeTab === 'history' && selectedFrameId && (
            <div>
              <button className="back-btn" onClick={handleBackToHistory}>
                ← Back to challenges
              </button>
              <Leaderboard
                frameId={selectedFrameId}
                onSelectFrame={setSelectedFrameId}
              />
            </div>
          )}
          {activeTab === 'leaderboard' && (
            <Leaderboard
              frameId={null}
              onSelectFrame={setSelectedFrameId}
            />
          )}
          {activeTab === 'friends' && (
            <FriendsActivity onSelectFrame={handleSelectFrame} />
          )}
        </main>

        <div className="dashboard-footer-actions">
          <button
            className="challenge-btn"
            onClick={onNavigateHome}
            disabled={isChallengeButtonDisabled}
          >
            {getChallengeButtonText()}
          </button>
          <button
            className="challenge-btn random-btn"
            onClick={onPlayRandom}
          >
            Play Random
          </button>
        </div>
      </div>
    </div>
  );
}
