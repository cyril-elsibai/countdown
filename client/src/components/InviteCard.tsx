/**
 * Invite card, shown when someone opens an invite link (/?invite=userId).
 *
 * Logged in → Accept makes you friends straight away (the inviter sent the link,
 * you clicked Accept: both agreed). Guest → create an account or log in first;
 * the invite waits in localStorage and this card comes back once signed in.
 */

import { useState } from 'react';
import { friendsApi, InviteResponse } from '../api';

interface Props {
  data: InviteResponse;
  loggedIn: boolean;
  onAccepted: () => void;
  onLogin: (mode: 'login' | 'register') => void;
  onPlay: () => void;     // guest: look at today's challenge first
  onDismiss: () => void;  // logged in: drop the invite
}

export default function InviteCard({ data, loggedIn, onAccepted, onLogin, onPlay, onDismiss }: Props) {
  const { inviter } = data;
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');

  const accept = async () => {
    setState('sending');
    try {
      await friendsApi.acceptInvite(inviter.id);
      setState('done');
      onAccepted();
    } catch {
      setState('error');
    }
  };

  // A guest closing the card keeps the invite for after sign-up
  const close = loggedIn ? onDismiss : onPlay;
  const title = state === 'done'
    ? `You and ${inviter.name} are friends`
    : `${inviter.name} invites you to be friends`;

  return (
    <>
      <div className="scrim" onClick={close} />
      <div className="sheet challenge-card" role="dialog" aria-label={title}>
        <div className="grab" />
        <div className="sheet-top">
          <h2 className="sheet-title">{title}</h2>
          <button className="icon-btn close-x" onClick={close} aria-label="Close">
            <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </div>

        {state === 'done' ? (
          <>
            <p className="challenge-line">You'll see each other's scores in Ranks and Stats.</p>
            <button className="btn ink wide" onClick={onDismiss}>Close</button>
          </>
        ) : loggedIn ? (
          <>
            <p className="challenge-line">
              {state === 'error' ? 'Couldn’t accept. Try again.' : 'Compare your scores on every daily challenge.'}
            </p>
            <div className="pair">
              <button className="btn ink" onClick={accept} disabled={state === 'sending'}>Accept</button>
              <button className="btn line" onClick={onDismiss}>Not now</button>
            </div>
          </>
        ) : (
          <>
            <p className="challenge-line">
              6/7 Numbers is a daily number puzzle. Create an account to compare your scores.
            </p>
            <div className="pair">
              <button className="btn ink" onClick={() => onLogin('register')}>Create account</button>
              <button className="btn line" onClick={() => onLogin('login')}>Log in</button>
            </div>
            <div className="challenge-friend">
              <button onClick={onPlay}>Try today's challenge first</button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
