// Client-side résumé generation with a hard offline guarantee.
//
// The 🎲 asks the model first (via /api/resume, which holds the key server-side).
// If there's no key, the network is down, or the call is slow, we fall back to
// the local wordlist generator. A booth demo must never show a spinner that
// never resolves, so the fallback is not an error path — it's the floor.

import { freshResume } from '@/components/create/RandomizeButton';

export interface ResumeCard {
  ticker: string;
  title: string;
  bullets: string[];
  asking_tc: number;
  tagline: string;
  /** true when this came from the local wordlists rather than the model. */
  offline: boolean;
}

/** Wordlist fallback, shaped like a model card. */
function localCard(): ResumeCard {
  const r = freshResume();
  return {
    // Derive a ticker from the title's capitals so offline cards look native.
    ticker:
      (r.title.match(/[A-Z]/g) ?? []).join('').slice(0, 5).padEnd(3, 'X') ||
      'LARP',
    title: r.title,
    bullets: r.bullets.slice(0, 3),
    asking_tc: r.askingTc,
    tagline: '',
    offline: true,
  };
}

/** How long a booth visitor will tolerate staring at a dice button. */
const TIMEOUT_MS = 9000;

/**
 * Generate one candidate card. Never rejects — on any failure it returns a
 * wordlist card with `offline: true` so the caller can render immediately.
 */
export async function generateResumeCard(seed?: string): Promise<ResumeCard> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch('/api/resume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seed: seed ?? '' }),
      signal: controller.signal,
    });
    if (!res.ok) return localCard();

    const card = (await res.json()) as Partial<ResumeCard>;
    if (!card?.title || !Array.isArray(card.bullets) || !card.bullets.length) {
      return localCard();
    }
    return {
      ticker: card.ticker ?? 'LARP',
      title: card.title,
      bullets: card.bullets,
      asking_tc: Number(card.asking_tc) || 450000,
      tagline: card.tagline ?? '',
      offline: false,
    };
  } catch {
    return localCard();
  } finally {
    clearTimeout(timer);
  }
}
