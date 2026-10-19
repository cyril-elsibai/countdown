/**
 * =============================================================================
 * SHORTCUTS (Dashboard/Shortcuts.tsx)
 * =============================================================================
 *
 * "Jump to" list at the top of the Daily tab, so regular players don't have
 * to page back through the calendar to find something to play:
 *   - the newest past daily you haven't played
 *   - the newest daily you didn't solve but someone else did
 *   - the newest daily a friend solved and you haven't
 * Each row shows the newest match not already shown above it, and how many
 * more there are. Today's daily
 * isn't included: the dock below already has a button for it. Rows with no
 * match are hidden, and the whole block is hidden when everything is done.
 *
 * @module client/components/Dashboard/Shortcuts
 */

import { useEffect, useState } from 'react';
import { dashboardApi, SuggestionGroup, SuggestionPick, SuggestionsResponse } from '../../api';

interface ShortcutsProps {
  onPlayFrame: (frameId: string, frameName?: string) => void;
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export default function Shortcuts({ onPlayFrame }: ShortcutsProps) {
  const [data, setData] = useState<SuggestionsResponse | null>(null);

  useEffect(() => {
    // Older servers don't have the endpoint yet: just show nothing
    dashboardApi.getSuggestions().then(setData).catch(() => setData(null));
  }, []);

  if (!data) return null;

  const awayText = (p: SuggestionPick) =>
    p.yourResult != null ? `you were ${Math.abs(p.targetNumber - p.yourResult)} away` : '';

  type Row = { key: string; group: SuggestionGroup; title: (p: SuggestionPick) => string; detail: (p: SuggestionPick) => string };
  const allRows: Row[] = [
    { key: 'unplayed', group: data.unplayed, title: () => 'Not played yet', detail: () => '' },
    { key: 'others', group: data.othersSolved, title: () => 'Others solved it, you didn\u2019t', detail: awayText },
    {
      key: 'friends',
      group: data.friendsSolved,
      title: p => `Solved by ${p.friendName}`,
      detail: p => p.yourResult != null ? awayText(p) : 'not played',
    },
  ];

  // The lists overlap; each row shows the newest daily not already shown above it
  const shown = new Set<string>();
  const rows = allRows.flatMap(row => {
    const pick = row.group.items?.find(p => !shown.has(p.id));
    if (!pick) return [];
    shown.add(pick.id);
    return [{ ...row, pick }];
  });

  if (rows.length === 0) return null;

  return (
    <section className="shortcuts">
      <h3 className="section-label">Jump to</h3>
      <ul className="list">
        {rows.map(({ key, title, group, detail, pick }) => {
          const name = `Daily #${pick.dailyNumber}`;
          const extra = [name, shortDate(pick.date), detail(pick), group.count > 1 ? `+${group.count - 1} more` : '']
            .filter(Boolean)
            .join(' · ');
          return (
            <li key={key} className="srow">
              <div>
                <b>{title(pick)}</b>
                <span className="sub">{extra}</span>
              </div>
              <button className="btn mini ink" onClick={() => onPlayFrame(pick.id, name)}>
                {pick.yourResult != null ? 'Try again' : 'Play'}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
