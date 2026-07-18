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
  /** Set when the request was rejected outright (bad file type, too big). */
  rejected?: 'unsupported_file_type' | 'file_too_large';
}

/** What the file picker should offer. DOCX is deliberately absent — Gemini
 *  cannot read it natively, so we ask for a PDF export instead. */
export const ACCEPTED_UPLOAD = '.pdf,.txt,.md,.csv,.rtf';

/** Wordlist fallback, shaped like a model card. */
function localCard(rejected?: ResumeCard['rejected']): ResumeCard {
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
    rejected,
  };
}

/** How long a booth visitor will tolerate staring at a dice button.
 *  A PDF takes the model longer to read than an empty prompt. */
const TIMEOUT_MS = 9000;
const UPLOAD_TIMEOUT_MS = 25000;

function toCard(raw: Partial<ResumeCard>): ResumeCard | null {
  if (!raw?.title || !Array.isArray(raw.bullets) || !raw.bullets.length) {
    return null;
  }
  return {
    ticker: raw.ticker ?? 'LARP',
    title: raw.title,
    bullets: raw.bullets,
    asking_tc: Number(raw.asking_tc) || 450000,
    tagline: raw.tagline ?? '',
    offline: false,
  };
}

/**
 * Generate one candidate card. Never rejects — on any failure it returns a
 * wordlist card with `offline: true` so the caller can render immediately.
 *
 * Pass a File to parody a real résumé, a string for pasted notes, or nothing
 * to have the model invent one.
 */
export async function generateResumeCard(
  seed?: string | File,
): Promise<ResumeCard> {
  const isFile = typeof File !== 'undefined' && seed instanceof File;
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    isFile ? UPLOAD_TIMEOUT_MS : TIMEOUT_MS,
  );

  try {
    let res: Response;
    if (isFile) {
      const form = new FormData();
      form.append('file', seed);
      res = await fetch('/api/resume', {
        method: 'POST',
        body: form,
        signal: controller.signal,
      });
    } else {
      res = await fetch('/api/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seed: seed ?? '' }),
        signal: controller.signal,
      });
    }

    if (!res.ok) {
      // 415/413 are the user's problem to fix, not a silent degradation —
      // surface them so the sheet can say "export it as a PDF".
      let rejected: ResumeCard['rejected'];
      try {
        const body = await res.json();
        if (body?.error === 'unsupported_file_type') rejected = 'unsupported_file_type';
        if (body?.error === 'file_too_large') rejected = 'file_too_large';
      } catch {
        // non-JSON error body; treat as a plain failure
      }
      return localCard(rejected);
    }

    return toCard((await res.json()) as Partial<ResumeCard>) ?? localCard();
  } catch {
    return localCard();
  } finally {
    clearTimeout(timer);
  }
}
