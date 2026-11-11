/**
 * Invite card, shown when someone opens an invite link: a friend invite
 * (/?invite=userId) or a group invite (/?group=CODE). App.tsx fills in the words.
 *
 * Logged in → Accept answers it in one tap. Guest → create an account or log
 * in first; the invite waits in localStorage and this card comes back once
 * signed in.
 */

import { useState } from 'react';

interface Props {
  title: string;
  doneTitle: string;
  line: string;         // logged in, before accepting
  guestLine: string;
  doneLine: string;
  acceptLabel: string;
  loggedIn: boolean;
  onAccept: () => Promise<void>;
  /** After accepting: the main button (e.g. open the group's leaderboard) */
  doneAction?: { label: string; onClick: () => void };
  onLogin: (mode: 'login' | 'register') => void;
  onPlay: () => void;     // guest: look at today's challenge first
  onDismiss: () => void;  // logged in: drop the invite
}

export default function InviteCard(props: Props) {
  const { loggedIn, onLogin, onPlay, onDismiss } = props;
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');

  const accept = async () => {
    setState('sending');
    try {
      await props.onAccept();
      setState('done');
    } catch {
      setState('error');
    }
  };

  // A guest closing the card keeps the invite for after sign-up
  const close = loggedIn ? onDismiss : onPlay;
  const title = state === 'done' ? props.doneTitle : props.title;

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
            <p className="challenge-line">{props.doneLine}</p>
            {props.doneAction ? (
              <div className="pair">
                <button className="btn ink" onClick={props.doneAction.onClick}>{props.doneAction.label}</button>
                <button className="btn line" onClick={onDismiss}>Close</button>
              </div>
            ) : (
              <button className="btn ink wide" onClick={onDismiss}>Close</button>
            )}
          </>
        ) : loggedIn ? (
          <>
            <p className="challenge-line">{state === 'error' ? 'Couldn’t accept. Try again.' : props.line}</p>
            <div className="pair">
              <button className="btn ink" onClick={accept} disabled={state === 'sending'}>{props.acceptLabel}</button>
              <button className="btn line" onClick={onDismiss}>Not now</button>
            </div>
          </>
        ) : (
          <>
            <p className="challenge-line">{props.guestLine}</p>
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
