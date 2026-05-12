const VERSION = '2';
const KEY_VERSION = 'wl-version';
const KEY_6 = 'wl-6';
const KEY_7 = 'wl-7';

let cache6: Set<string> | null = null;
let cache7: Set<string> | null = null;

async function fetchAndParse(length: 6 | 7): Promise<string[]> {
  const res = await fetch(`/valid-${length}.txt`);
  const text = await res.text();
  return text.split('\n').map(w => w.trim().toUpperCase()).filter(Boolean);
}

export async function loadWordLists(): Promise<void> {
  if (cache6 && cache7) return;

  if (localStorage.getItem(KEY_VERSION) === VERSION) {
    const raw6 = localStorage.getItem(KEY_6);
    const raw7 = localStorage.getItem(KEY_7);
    if (raw6 && raw7) {
      cache6 = new Set(raw6.split(','));
      cache7 = new Set(raw7.split(','));
      return;
    }
  }

  const [words6, words7] = await Promise.all([fetchAndParse(6), fetchAndParse(7)]);

  try {
    localStorage.setItem(KEY_6, words6.join(','));
    localStorage.setItem(KEY_7, words7.join(','));
    localStorage.setItem(KEY_VERSION, VERSION);
  } catch {
    // localStorage full — fall back to in-memory only
  }

  cache6 = new Set(words6);
  cache7 = new Set(words7);
}

export function isValidWord(word: string, length: 6 | 7): boolean {
  const list = length === 6 ? cache6 : cache7;
  if (!list) return true; // fail open if not loaded yet
  return list.has(word.toUpperCase());
}
