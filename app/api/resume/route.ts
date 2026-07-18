import { GoogleGenAI, Type } from '@google/genai';
import { NextResponse } from 'next/server';

// ============================================================================
// The résumé desk. Generates ONE candidate card of insufferable LinkedIn-speak.
//
// Server-only: GEMINI_API_KEY never reaches the browser. If the key is absent
// or the call fails, this returns 503 and the client silently falls back to
// the local wordlist generator — the booth keeps working with the wifi down,
// which is the whole reason the wordlists still exist.
// ============================================================================

export const runtime = 'nodejs';
// The card must differ every roll, so never cache this route.
export const dynamic = 'force-dynamic';

/** Overridable so a model rename doesn't require a code change at the booth. */
const MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';

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
 * Gemini's structured-output schema. Pinning the shape at the API layer means
 * a malformed card can't reach the game — this replaces "return STRICT JSON
 * only" prompting and the JSON.parse guesswork that goes with it.
 */
const CARD_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    ticker: { type: Type.STRING, description: '3-5 uppercase letters, no $' },
    title: { type: Type.STRING, description: 'An inflated job title' },
    bullets: {
      type: Type.ARRAY,
      description: 'Exactly 3 delusional accomplishments, each under 12 words',
      items: { type: Type.STRING },
    },
    asking_tc: {
      type: Type.INTEGER,
      description: 'Asking total comp in whole dollars, 180000-950000',
    },
    tagline: { type: Type.STRING, description: 'One line, max 8 words' },
  },
  required: ['ticker', 'title', 'bullets', 'asking_tc', 'tagline'],
  // Gemini honours declaration order when generating; keep it stable.
  propertyOrdering: ['ticker', 'title', 'bullets', 'asking_tc', 'tagline'],
};

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
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'no_api_key', detail: 'GEMINI_API_KEY is not set' },
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
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: `Seed: ${seed || '(empty)'}\nGenerate one candidate card.`,
      config: {
        systemInstruction: SYSTEM,
        responseMimeType: 'application/json',
        responseSchema: CARD_SCHEMA,
        maxOutputTokens: 1024,
        // A booth visitor is holding a phone waiting for the dice to land, so
        // this is tuned for latency: thinking off. The task is short and
        // well-specified enough not to need it.
        thinkingConfig: { thinkingBudget: 0 },
        // The dice must feel different every roll.
        temperature: 1.1,
      },
    });

    const text = response.text;
    if (!text) {
      return NextResponse.json({ error: 'empty_response' }, { status: 503 });
    }

    const card = sanitize(JSON.parse(text) as ResumeCard);
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
