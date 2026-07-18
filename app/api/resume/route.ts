import { GoogleGenAI, Type } from '@google/genai';
import { NextResponse } from 'next/server';

// ============================================================================
// The résumé desk. Generates ONE candidate card of insufferable LinkedIn-speak.
//
// Accepts three shapes of seed:
//   1. multipart/form-data with `file`  — a real résumé (PDF / text), sent to
//      Gemini as inline data
//   2. JSON `{ seed: "..." }`           — pasted text or rough notes
//   3. nothing                          — the model invents one from scratch
//
// Server-only: GEMINI_API_KEY never reaches the browser. If the key is absent
// or the call fails, this returns 503 and the client silently falls back to
// the local wordlist generator — the booth keeps working with the wifi down.
//
// PRIVACY: an uploaded résumé is sent to Google to generate the card. It is
// never written to disk and never stored in the database — only the generated
// parody card is persisted. The UI says so at the upload control.
// ============================================================================

export const runtime = 'nodejs';
// The card must differ every roll, so never cache this route.
export const dynamic = 'force-dynamic';

/** Overridable so a model rename doesn't require a code change at the booth. */
const MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';

/** Gemini reads these natively. DOCX is NOT on the list — export to PDF. */
const ACCEPTED_MIME: Record<string, string> = {
  'application/pdf': 'application/pdf',
  'text/plain': 'text/plain',
  'text/markdown': 'text/plain',
  'text/x-markdown': 'text/plain',
  'text/csv': 'text/plain',
  'text/rtf': 'text/rtf',
  'application/rtf': 'text/rtf',
};

/** Résumés are small. This is a guard against someone uploading a film. */
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

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
- If the seed is a real résumé, inflate THAT person's actual domain and history
  — the joke should be recognisably about their work. Never copy their real
  employer or school names, and never reproduce lines from the document
  verbatim.
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

type Seed =
  | { kind: 'none' }
  | { kind: 'text'; text: string }
  | { kind: 'file'; mimeType: string; base64: string; filename: string };

/** Reads the seed out of either a multipart upload or a JSON body. */
async function readSeed(req: Request): Promise<Seed | { error: string; status: number }> {
  const contentType = req.headers.get('content-type') ?? '';

  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      const text = String(form.get('seed') ?? '').slice(0, 4000);
      return text ? { kind: 'text', text } : { kind: 'none' };
    }
    if (file.size === 0) return { kind: 'none' };
    if (file.size > MAX_UPLOAD_BYTES) {
      return { error: 'file_too_large', status: 413 };
    }
    const mimeType = ACCEPTED_MIME[file.type];
    if (!mimeType) {
      // DOCX lands here. Gemini can't read it natively and silently guessing a
      // type produces garbage, so say so rather than fail mysteriously.
      return { error: 'unsupported_file_type', status: 415 };
    }
    const base64 = Buffer.from(await file.arrayBuffer()).toString('base64');
    return { kind: 'file', mimeType, base64, filename: file.name };
  }

  try {
    const body = await req.json();
    const text = typeof body?.seed === 'string' ? body.seed.slice(0, 4000) : '';
    return text ? { kind: 'text', text } : { kind: 'none' };
  } catch {
    // no body is a valid request — the seed is optional
    return { kind: 'none' };
  }
}

export async function POST(req: Request) {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'no_api_key', detail: 'GEMINI_API_KEY is not set' },
      { status: 503 },
    );
  }

  const seed = await readSeed(req);
  if ('error' in seed) {
    return NextResponse.json({ error: seed.error }, { status: seed.status });
  }

  // Build the user turn. A file becomes an inlineData part alongside the
  // instruction; text and empty seeds are plain text.
  const INSTRUCTION =
    seed.kind === 'file'
      ? 'The attached document is my résumé. Generate one candidate card from it.'
      : seed.kind === 'text'
        ? `Seed: ${seed.text}\nGenerate one candidate card.`
        : 'Seed: (empty)\nGenerate one candidate card.';

  const parts =
    seed.kind === 'file'
      ? [
          { inlineData: { mimeType: seed.mimeType, data: seed.base64 } },
          { text: INSTRUCTION },
        ]
      : [{ text: INSTRUCTION }];

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [{ role: 'user', parts }],
      config: {
        systemInstruction: SYSTEM,
        responseMimeType: 'application/json',
        responseSchema: CARD_SCHEMA,
        maxOutputTokens: 1024,
        // A booth visitor is holding a phone waiting for the dice to land, so
        // this is tuned for latency: thinking off.
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

    return NextResponse.json(card, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'unknown';
    console.error('[overvalued] résumé generation failed:', detail);
    return NextResponse.json({ error: 'generation_failed', detail }, { status: 503 });
  }
}
