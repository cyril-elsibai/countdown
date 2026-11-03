import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Analytics, type BeforeSendEvent } from '@vercel/analytics/react';
import App from './App';
import './App.css';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// Never send tokens (verify/reset links) or user/frame ids to analytics.
// Shared challenge links (/play/:id?from=…) are kept apart as /play/shared to measure the share loop.
function scrubEvent(event: BeforeSendEvent): BeforeSendEvent | null {
  const url = new URL(event.url);
  if (url.pathname === '/admin') return null;
  const shared = url.searchParams.has('from');
  url.search = '';
  if (url.pathname.startsWith('/play/')) url.pathname = shared ? '/play/shared' : '/play';
  return { ...event, url: url.toString() };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Analytics beforeSend={scrubEvent} />
  </StrictMode>
);