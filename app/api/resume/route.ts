import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';

// ============================================================================
// The résumé desk. Generates ONE candidate card of insufferable LinkedIn-speak.
//
// Server-only: ANTHROPIC_API_KEY never reaches the browser. If the key is
// absent or the call fails, this returns 503 and the client silently falls
// back to the local wordlist generator — the booth keeps working with the
// wifi down, which is the whole reason the wordlists still exist.
// ============================================================================

export const runtime = 'nodejs';
// The card must differ every roll, so never cache this route.
export const dynamic = 'force-dynamic';

const SYSTEM = `You are the résumé desk for "Overvalued," a satirical prediction market about
LinkedIn/résumé inflation. Given a seed (a real résumé, a few rough notes, or
nothing), return ONE candidate card written as insufferable, over-confident
LinkedIn-speak: maximum buzzword density, humblebrags, vague world-changing
impact, zero real numbers that mean anything.

Rules:
- ticker: 3–5 uppercase letters, no "$". Derive it from the vibe/title.
- title: an inflated job title. e.g. "Chief Vibes Architect",
  "Principal Thought Leader", "10x Founding Growth Ninja".
- bullets: exactly 3, each one short (<12 words), each a delusional
  accomplishment. Lean on: "architected", "spearheaded", "10x'd", "disrupted",
  "single-handedly", "evangelized", "north-star". Comedy comes from the gap
  between grand verb and trivial reality — but NEVER state the trivial reality.
  Leave it implied. (Good: "Architected scalable microservices at global scale."
  Bad: "Architected microservices (ran create-react-app once).")
- asking_tc: integer dollars, absurd but not infinite. 180000–950000.
- tagline: one line, max 8 words. e.g. "Ex-FAANG (intern). Currently between
  disruptions."
- Keep it PG-13. Roast the GENRE of self-promotion, never a real person, group,
  company, or protected class. No names of real people or companies.
- IMPORTANT: write the SAME confident register whether the seed is impressive or
  empty. Do not signal whether the underlying résumé is real. The card must never
  hint at legitimacy either way.`;

/**
 * Structured outputs pin the response shape at the API layer, so a malformed
 * card can't reach the game. This replaces "return STRICT JSON only" prompting
 * and the JSON.parse guesswork that goes with it.
 */
const CARD_SCHEMA = {
  type: 'object',
  properties: {
    ticker: { type: 'string', description: '3-5 uppercase letters, no $' },
    title: { type: 'string', description: 'An inflated job title' },
    bullets: {
      type: 'array',
      description: 'Exactly 3 delusional accomplishments, each under 12 words',
      items: { type: 'string' },
    },
    asking_tc: {
      type: 'integer',
      description: 'Asking total comp in whole dollars, 180000-950000',
    },
    tagline: { type: 'string', description: 'One line, max 8 words' },
  },
  required: ['ticker', 'title', 'bullets', 'asking_tc', 'tagline'],
  additionalProperties: false,
} as const;

export interface ResumeCard {
  ticker: string;
  title: string;
  bullets: string[];
  asking_tc: number;
  tagline: string;
}

/** Clamp the model's output into the game's integer/format invariants. */
function sanitize(card: ResumeCard): ResumeCard {
  const ticker = (card.ticker ?? '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 5);
  const bullets = (card.bullets ?? [])
    .map((b) => String(b).trim())
    .filter(Boolean)
    .slice(0, 3);
  // asking_tc is money and must land on the integer path the market uses.
  const tc = Math.round(Number(card.asking_tc));
  return {
    ticker: ticker.length >= 3 ? ticker : 'LARP',
    title: String(card.title ?? '').trim().slice(0, 90),
    bullets,
    asking_tc: Number.isFinite(tc) ? Math.min(950000, Math.max(180000, tc)) : 450000,
    tagline: String(card.tagline ?? '').trim().slice(0, 80),
  };
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'no_api_key', detail: 'ANTHROPIC_API_KEY is not set' },
      { status: 503 },
    );
  }

  let seed = '';
  try {
    const body = await req.json();
    seed = typeof body?.seed === 'string' ? body.seed.slice(0, 4000) : '';
  } catch {
    // no body is a valid request — the seed is optional
  }

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1024,
      system: SYSTEM,
      // A booth visitor is holding a phone waiting for the dice to land, so
      // this is tuned for latency: low effort, no thinking. The task is short
      // and well-specified enough not to need either.
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: CARD_SCHEMA },
      },
      messages: [
        {
          role: 'user',
          content: `Seed: ${seed || '(empty)'}\nGenerate one candidate card.`,
        },
      ],
    });

    if (response.stop_reason === 'refusal') {
      return NextResponse.json({ error: 'refused' }, { status: 503 });
    }

    const text = response.content.find((b) => b.type === 'text');
    if (!text || text.type !== 'text') {
      return NextResponse.json({ error: 'empty_response' }, { status: 503 });
    }

    const card = sanitize(JSON.parse(text.text) as ResumeCard);
    if (!card.title || card.bullets.length === 0) {
      return NextResponse.json({ error: 'incomplete_card' }, { status: 503 });
    }

    return NextResponse.json(card, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'unknown';
    console.error('[overvalued] résumé generation failed:', detail);
    return NextResponse.json({ error: 'generation_failed', detail }, { status: 503 });
  }
}
