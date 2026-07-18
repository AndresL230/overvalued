// Identity for a no-auth party game: a uuid in localStorage, nothing more.
// Keys are part of the frozen contract — ov_player_id / ov_handle.

const ID_KEY = 'ov_player_id';
const HANDLE_KEY = 'ov_handle';
const REF_CLAIMED_KEY = 'ov_ref_claimed';

/** Cursed-but-friendly default handles so the leaderboard is never all "anon". */
const ADJECTIVES = [
  'Liquid', 'Illiquid', 'Levered', 'Unvested', 'Diluted', 'Vested', 'Bearish',
  'Bullish', 'Overfit', 'Undervalued', 'Fully-Diluted', 'Pre-Seed', 'Series-B',
  'Exited', 'Rugged', 'Cracked', 'Nontechnical', 'Load-Bearing',
];
const NOUNS = [
  'Intern', 'Founder', 'Recruiter', 'Analyst', 'Cofounder', 'Advisor', 'Operator',
  'Generalist', 'Cofounder', 'IC6', 'Skip-Level', 'Headcount', 'Contractor',
  'Consultant', 'Scrum Lord', 'Thought Leader',
];

export function randomHandle(): string {
  const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const n = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${a} ${n}`;
}

/** Stable per-browser id. Creates one on first call. Client-only. */
export function getOrCreatePlayerId(): string {
  let id = localStorage.getItem(ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(ID_KEY, id);
  }
  return id;
}

export function getOrCreateHandle(): string {
  let h = localStorage.getItem(HANDLE_KEY);
  if (!h) {
    h = randomHandle();
    localStorage.setItem(HANDLE_KEY, h);
  }
  return h;
}

export function setStoredHandle(handle: string): void {
  localStorage.setItem(HANDLE_KEY, handle);
}

/** Pull ?ref=CODE off the URL. Returns null when absent. */
export function readRefCodeFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const code = new URLSearchParams(window.location.search).get('ref');
  return code ? code.trim().toUpperCase() : null;
}

/**
 * claim_referral is idempotent server-side, but there is no reason to hit the
 * network on every reload — remember locally that we already tried.
 */
export function hasTriedRefClaim(): boolean {
  return localStorage.getItem(REF_CLAIMED_KEY) === '1';
}

export function markRefClaimTried(): void {
  localStorage.setItem(REF_CLAIMED_KEY, '1');
}

/** Strip ?ref= from the address bar after claiming, so a reload isn't a re-claim. */
export function stripRefFromUrl(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has('ref')) return;
  url.searchParams.delete('ref');
  window.history.replaceState({}, '', url.toString());
}

export function shareUrlFor(refCode: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/?ref=${refCode}`;
}
