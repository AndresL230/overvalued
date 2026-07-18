import { GoogleGenAI, Type } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// ============================================================================
// The bot opinion desk. Called by pg_cron/pg_net every ~30s and by nothing
// else.
//
// Gemini decides DIRECTION; SQL executes trades. Two loops at different
// speeds. `bot_tick()` fires every 5s and reads whatever opinion is already
// sitting in `bot_leans`; this route tops that table up on its own schedule.
// An LLM outage therefore degrades the board's *intelligence*, never its
// *liveliness* — SQL falls back to random leans and the odds keep moving.
//
// Two jobs per invocation, one Gemini round trip:
//   1. assign a (lean, conviction) to every (bot, active market) pair whose
//      row is missing or stale
//   2. top up `bot_market_templates` when unused rows run low, so the re-seed
//      branch of bot_tick() never waits on an API call
//
// SECURITY: this uses a SERVICE-ROLE client, not the anon client in
// `lib/supabase.ts`, because it must read `markets.is_real` — the secret the
// whole game turns on. SUPABASE_SERVICE_ROLE_KEY is server-only and must never
// be prefixed with NEXT_PUBLIC_ or returned in a response body.
//
// NEVER BLOCKS: 8s abort budget, and every failure path returns 200 with a
// `path` telling you which branch ran. A 5xx here would just spam pg_cron
// notices for a subsystem that is designed to degrade silently.
// ============================================================================

export const runtime = 'nodejs';
// No `dynamic = 'force-dynamic'`: POST/GET handlers with runtime data are
// never cached in Next 16, and the segment config is removed outright once
// Cache Components is enabled.

/** Overridable so a model rename doesn't require a code change. */
const MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';

/** Hard ceiling on the whole Gemini leg. The cron tick is 30s; never approach it. */
const TIMEOUT_MS = 8000;

/** Opinion staleness window, per row. See JITTER note below. */
const REFRESH_MIN_MS = 45_000;
const REFRESH_MAX_MS = 120_000;

/** Below this many unused templates, generate more. */
const TEMPLATE_LOW_WATER = 5;
/** Refill target. Gemini generates ahead of demand; SQL consumes instantly. */
const TEMPLATE_TARGET = 10;
/** Cap per call so one invocation can't balloon the output budget. */
const TEMPLATE_MAX_PER_CALL = 4;

/** Prompt-size guards. The board is small by design; this is belt-and-braces. */
const MAX_MARKETS = 24;
const MAX_PAIRS = 96;

type Lean = 'yes' | 'no';

interface BotRow {
  id: string;
  handle: string;
}

interface MarketRow {
  id: string;
  title: string;
  bullets: string[] | null;
  asking_tc: number | null;
  prob_yes_bps: number | null;
  is_real: boolean;
}

interface LeanOut {
  bot_id: string;
  market_id: string;
  lean: Lean;
  conviction: number;
}

interface TemplateOut {
  title: string;
  bullets: string[];
  asking_tc: number;
  is_real: boolean;
}

interface BatchOut {
  leans: LeanOut[];
  templates: TemplateOut[];
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const SYSTEM = `You run the bot desk for "Overvalued," a satirical prediction market where
players bet on whether a cursed job listing describes a REAL person or a
made-up one. Four bots trade against the humans to keep the odds moving.

You do two things: assign opinions, and (when asked) write new listings.

## Job 1 — assign one opinion per (bot, market) pair

You are shown each market's hidden truth (is_real) and its current price
(prob_yes_bps, 0-10000, where 10000 = the crowd is certain it is real).
"lean" is the side that bot will buy: "yes" = betting the listing is real.

Rules, in priority order:

1. **DISAGREEMENT IS MANDATORY.** This is the most important rule and it
   overrides rule 2. Bots must NOT converge. For any market where you are
   assigning 2 or more opinions, at least one bot must take the opposite side
   from the others. Target a 2-1, 3-1 or 2-2 split — never 4-0, never 3-0.
   If every bot lands on the truth the price snaps to correct and there is no
   mispricing left for a human to trade against. A market with no gap in it is
   a dead market.

2. **Lean SLIGHTLY toward the truth.** Across the whole batch, a bare majority
   of leans should match is_real — enough that a wildly mispriced market
   drifts back toward correct over a few minutes, not enough to pin it there.
   Weight this by how wrong the price currently is: if prob_yes_bps is far
   from the truth, tilt harder toward correcting it; if the price is already
   close to correct, tilt the other way so the market keeps oscillating instead
   of flatlining at the answer.

3. **Conviction (1-3) is confidence, NOT correctness.** A bot that is
   confidently wrong is a feature — it is what pays a sharp human. Never
   downgrade conviction just because you assigned the wrong side, and never use
   conviction as a hidden signal of the truth. Spread conviction across the
   batch; do not make everything a 2.

4. **Keep bot temperaments consistent.** Judge each bot by its handle:
   RecruiterBot is credulous and buys the pitch, VC_Tourist chases whatever the
   price is already doing, ex-FAANG_Guy is a sneering contrarian who assumes
   everyone is inflating, Anon_Degen is loud, random and high-conviction.
   Temperament is a good source of the disagreement rule 1 demands.

Each pair carries an index "i". Echo that index back; never invent one, never
repeat one, and emit exactly one entry per requested pair.

## Job 2 — write new listings for the template pool

Same voice as the board: insufferable LinkedIn-speak, buzzword-dense,
humblebragging, PG-13.

- title: inflated role, a hook, then the ask. Match this shape exactly:
  "Chief Vibes Architect · asking $450K"
  "Staff SRE · kept prod up through 3 acquisitions · asking $310K"
- bullets: exactly 4, each under 12 words, each a delusional-sounding
  accomplishment. Comedy is the gap between the grand verb and the trivial
  reality — imply the reality, never state it.
- asking_tc: integer dollars, 180000-950000. Must match the $NNNK in the title.
- is_real: roughly half true, half false, shuffled.
- Roast the GENRE of self-promotion. No real people, companies, schools or
  protected classes.

**CRITICAL — tone must never leak the answer.** A listing with is_real=true is
NOT more sober, more specific, or more measured than one with is_real=false.
Both are written with the identical absurd, over-confident register. A real
candidate is a genuinely competent person described just as insufferably as a
fraud. If a player could guess is_real from the writing style alone, you have
failed. Do not put the real ones' numbers in and leave the fake ones vague;
give the fakes hard-looking numbers too.`;

// Two schemas, not one, because the two jobs go out as two CONCURRENT calls.
// Serially they blow the 8s budget (measured: ~9s for 20 leans + 6 listings,
// which tripped the abort and cost us the leans as well). They are independent
// work, so a slow listing generation must never starve the opinions.
const LEANS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    leans: {
      type: Type.ARRAY,
      description: 'One entry per requested pair, referenced by its index i.',
      items: {
        type: Type.OBJECT,
        properties: {
          // Pairs are addressed by index, not by uuid. Echoing two 36-char
          // uuids per row tripled the output tokens and pushed a full
          // cold-start batch (24 pairs) past the 8s abort. The index costs
          // 1-2 tokens and the mapping back is exact.
          i: { type: Type.INTEGER, description: 'the pair index from the request' },
          lean: { type: Type.STRING, description: 'exactly "yes" or "no"' },
          conviction: { type: Type.INTEGER, description: 'confidence 1-3, not correctness' },
        },
        required: ['i', 'lean', 'conviction'],
        propertyOrdering: ['i', 'lean', 'conviction'],
      },
    },
  },
  required: ['leans'],
  propertyOrdering: ['leans'],
};

const TEMPLATES_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    templates: {
      type: Type.ARRAY,
      description: 'New job listings for the template pool.',
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: 'Inflated role · hook · asking $NNNK' },
          bullets: {
            type: Type.ARRAY,
            description: 'Exactly 4, each under 12 words',
            items: { type: Type.STRING },
          },
          asking_tc: { type: Type.INTEGER, description: 'Whole dollars, 180000-950000' },
          is_real: { type: Type.BOOLEAN, description: 'Hidden truth. Must not affect tone.' },
        },
        required: ['title', 'bullets', 'asking_tc', 'is_real'],
        propertyOrdering: ['title', 'bullets', 'asking_tc', 'is_real'],
      },
    },
  },
  required: ['templates'],
  propertyOrdering: ['templates'],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * JITTER — the whole point of the design.
 *
 * Computed PER ROW, never once per batch. If every row in a batch shared one
 * `refresh_at`, all four bots would re-form their opinions on the same tick and
 * the trades those opinions drive would arrive as a synchronized burst followed
 * by dead air. Staggering the expiries makes the resulting trades trickle in
 * continuously, which is what makes the board look alive.
 */
function jitteredRefreshAt(): string {
  const ms = REFRESH_MIN_MS + Math.random() * (REFRESH_MAX_MS - REFRESH_MIN_MS);
  return new Date(Date.now() + ms).toISOString();
}

function randomLean(): Lean {
  return Math.random() < 0.5 ? 'yes' : 'no';
}

/**
 * Backstop for prompt rule 1. The model is asked for disagreement, but "asked"
 * is not "guaranteed", and unanimity is the one failure mode that actually
 * breaks the game — it snaps the odds to the answer and leaves a human nothing
 * to trade. So we verify it in code: any market where 3+ bots in this batch
 * agree gets exactly one defector, chosen as the lowest-conviction opinion so
 * we corrupt the weakest belief rather than the strongest.
 */
function forceDisagreement(leans: LeanOut[]): number {
  const byMarket = new Map<string, LeanOut[]>();
  for (const l of leans) {
    const bucket = byMarket.get(l.market_id);
    if (bucket) bucket.push(l);
    else byMarket.set(l.market_id, [l]);
  }

  let flipped = 0;
  for (const group of byMarket.values()) {
    if (group.length < 3) continue;
    if (!group.every((l) => l.lean === group[0].lean)) continue;
    const weakest = group.reduce((a, b) => (b.conviction < a.conviction ? b : a));
    weakest.lean = weakest.lean === 'yes' ? 'no' : 'yes';
    flipped += 1;
  }
  return flipped;
}

function sanitizeLeans(
  raw: unknown,
  pairs: { bot: BotRow; market: MarketRow }[],
): LeanOut[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<number>();
  const out: LeanOut[] = [];

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const idx = Math.round(Number(r.i));
    // Drop out-of-range indices and duplicates — a duplicate would blow up the
    // upsert with "cannot affect row a second time".
    if (!Number.isFinite(idx) || idx < 0 || idx >= pairs.length || seen.has(idx)) continue;
    seen.add(idx);
    const bot_id = pairs[idx].bot.id;
    const market_id = pairs[idx].market.id;

    const lean: Lean = String(r.lean ?? '').toLowerCase() === 'yes' ? 'yes' : 'no';
    const n = Math.round(Number(r.conviction));
    const conviction = Number.isFinite(n) ? Math.min(3, Math.max(1, n)) : 2;
    out.push({ bot_id, market_id, lean, conviction });
  }
  return out;
}

/**
 * The title is a single display line on a market card. The model reliably
 * renders the "role · hook · asking $NNNK" shape as literal newlines instead
 * of the separator, which would blow out the card layout, so fold any line
 * breaks back into the interpunct form rather than trusting the prompt.
 */
function oneLine(s: string, sep = ' · '): string {
  return s
    .split(/[\r\n]+/)
    .map((part) => part.trim().replace(/\s+/g, ' ').replace(/^[·•|–-]\s*/, ''))
    .filter(Boolean)
    .join(sep);
}

function sanitizeTemplates(raw: unknown, limit: number): TemplateOut[] {
  if (!Array.isArray(raw)) return [];
  const out: TemplateOut[] = [];

  for (const item of raw.slice(0, limit)) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const title = oneLine(String(r.title ?? '')).slice(0, 160);
    const bullets = Array.isArray(r.bullets)
      ? r.bullets.map((b) => oneLine(String(b), ' ')).filter(Boolean).slice(0, 4)
      : [];
    // asking_tc is money and must land on the integer path the market uses.
    const tc = Math.round(Number(r.asking_tc));
    if (!title || bullets.length < 2 || !Number.isFinite(tc)) continue;

    out.push({
      title,
      bullets,
      asking_tc: Math.min(950000, Math.max(180000, tc)),
      is_real: Boolean(r.is_real),
    });
  }
  return out;
}

/** Uniform reply shape. Always 200 — see the NEVER BLOCKS note at the top. */
function ok(path: string, extra: Record<string, unknown> = {}) {
  console.log(`[overvalued] bot-leans: path=${path}`, JSON.stringify(extra));
  return NextResponse.json(
    { ok: true, path, ...extra },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

async function handle() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    // Nothing to do without DB access, but this is a config problem, not a
    // request failure. bot_tick() keeps trading on random leans regardless.
    return ok('no_service_key', {
      detail: 'SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL missing',
      leans_written: 0,
      templates_written: 0,
    });
  }

  // Deliberately untyped: `lib/db.types.ts` is knowingly stale w.r.t.
  // bot_leans / bot_market_templates (see the design doc — the tables have no
  // anon grant and are never client-read, so regenerating buys nothing and
  // risks a merge collision with the lane that has lib/ open).
  const db = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    // -- 1. What needs an opinion, and are we short on templates? -----------
    const [botsRes, marketsRes, leansRes, templateRes] = await Promise.all([
      db.from('players').select('id, handle').eq('is_bot', true),
      db
        .from('markets')
        .select('id, title, bullets, asking_tc, prob_yes_bps, is_real')
        .eq('status', 'active')
        .order('expires_at', { ascending: true })
        .limit(MAX_MARKETS),
      db.from('bot_leans').select('bot_id, market_id, refresh_at'),
      db
        .from('bot_market_templates')
        .select('id', { count: 'exact', head: true })
        .is('used_at', null),
    ]);

    const firstErr =
      botsRes.error ?? marketsRes.error ?? leansRes.error ?? templateRes.error;
    if (firstErr) {
      return ok('db_error', {
        detail: firstErr.message,
        leans_written: 0,
        templates_written: 0,
      });
    }

    const bots = (botsRes.data ?? []) as BotRow[];
    const markets = (marketsRes.data ?? []) as MarketRow[];

    const now = Date.now();
    const fresh = new Set<string>();
    for (const row of leansRes.data ?? []) {
      const r = row as { bot_id: string; market_id: string; refresh_at: string };
      if (new Date(r.refresh_at).getTime() > now) fresh.add(`${r.bot_id}:${r.market_id}`);
    }

    // Every (bot, active market) pair whose row is missing or already stale.
    const pairs: { bot: BotRow; market: MarketRow }[] = [];
    for (const market of markets) {
      for (const bot of bots) {
        if (fresh.has(`${bot.id}:${market.id}`)) continue;
        pairs.push({ bot, market });
        if (pairs.length >= MAX_PAIRS) break;
      }
      if (pairs.length >= MAX_PAIRS) break;
    }

    const unusedTemplates = templateRes.count ?? 0;
    const templatesWanted =
      unusedTemplates < TEMPLATE_LOW_WATER
        ? Math.min(TEMPLATE_MAX_PER_CALL, TEMPLATE_TARGET - unusedTemplates)
        : 0;

    if (pairs.length === 0 && templatesWanted === 0) {
      return ok('noop', {
        detail: 'every opinion is fresh and the template pool is stocked',
        active_markets: markets.length,
        unused_templates: unusedTemplates,
        leans_written: 0,
        templates_written: 0,
      });
    }

    // -- 2. Ask Gemini, or degrade -----------------------------------------
    const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;

    let batch: BatchOut | null = null;
    let templateBatch: TemplateOut[] | null = null;
    let path = 'gemini';

    let templatePath = templatesWanted > 0 ? 'gemini' : 'not_needed';

    if (!apiKey) {
      path = 'no_api_key';
      if (templatesWanted > 0) templatePath = 'no_api_key';
    } else {
      const ai = new GoogleGenAI({ apiKey });
      // ONE signal for the whole Gemini leg, so the 8s ceiling covers both
      // calls together rather than 8s each.
      const signal = AbortSignal.timeout(TIMEOUT_MS);

      const marketBrief = markets
        .filter((m) => pairs.some((p) => p.market.id === m.id))
        .map((m) => ({
          market_id: m.id,
          title: m.title,
          bullets: m.bullets ?? [],
          asking_tc: m.asking_tc,
          // The secret. Safe here and ONLY here: this runs server-side under
          // the service role and is never echoed back to a client.
          is_real: m.is_real,
          prob_yes_bps: m.prob_yes_bps,
        }));

      // Indices, not uuids — see the note on LEANS_SCHEMA.i.
      const pairBrief = pairs.map((p, i) => ({
        i,
        bot: p.bot.handle,
        market_id: p.market.id,
      }));

      const ask = async (prompt: string, schema: object, maxOutputTokens: number) => {
        const response = await ai.models.generateContent({
          model: MODEL,
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          config: {
            systemInstruction: SYSTEM,
            responseMimeType: 'application/json',
            responseSchema: schema,
            maxOutputTokens,
            abortSignal: signal,
            // Latency over deliberation: thinking off, same as the résumé desk.
            thinkingConfig: { thinkingBudget: 0 },
            // Disagreement needs entropy. A cold model converges on the truth,
            // which is the exact failure mode rule 1 exists to prevent.
            temperature: 1.3,
          },
        });
        const text = response.text;
        if (!text) throw new Error('empty response');
        return JSON.parse(text) as Partial<BatchOut>;
      };

      const classify = (err: unknown) => {
        const detail = err instanceof Error ? err.message : 'unknown';
        return {
          detail,
          path:
            detail.toLowerCase().includes('abort') || detail.toLowerCase().includes('timeout')
              ? 'gemini_timeout'
              : 'gemini_error',
        };
      };

      // Concurrent and independently settled: a failed template call still
      // leaves the leans intact, and vice versa.
      const [leanCall, templateCall] = await Promise.allSettled([
        pairs.length > 0
          ? ask(
              [
                `Assign an opinion to each of these ${pairBrief.length} (bot, market) pairs.`,
                'Return one entry per pair, echoing its "i" index. Do not repeat an index.',
                `PAIRS:\n${JSON.stringify(pairBrief)}`,
                `MARKETS:\n${JSON.stringify(marketBrief)}`,
              ].join('\n\n'),
              LEANS_SCHEMA,
              4096,
            )
          : Promise.resolve<Partial<BatchOut>>({ leans: [] }),
        templatesWanted > 0
          ? ask(
              `Write ${templatesWanted} new job listings for the template pool. Job 1 does not apply to this request.`,
              TEMPLATES_SCHEMA,
              2048,
            )
          : Promise.resolve<Partial<BatchOut>>({ templates: [] }),
      ]);

      if (leanCall.status === 'fulfilled') {
        batch = { leans: leanCall.value.leans ?? [], templates: [] };
      } else {
        // Timeout, quota, 5xx, malformed JSON — all the same to us. Fall
        // through to random leans; the board does not stop for Google.
        const c = classify(leanCall.reason);
        console.error('[overvalued] bot-leans: lean call failed, degrading:', c.detail);
        path = c.path;
      }

      if (templatesWanted > 0) {
        if (templateCall.status === 'fulfilled') {
          templateBatch = templateCall.value.templates ?? [];
        } else {
          const c = classify(templateCall.reason);
          console.error('[overvalued] bot-leans: template call failed:', c.detail);
          templatePath = c.path;
        }
      }
    }

    // -- 3. Leans: model output, else random --------------------------------
    const leans = batch ? sanitizeLeans(batch.leans, pairs) : [];
    let degradedLeans = 0;

    // Any pair the model skipped still needs an opinion, or that bot simply
    // sits out the market until the next tick.
    const covered = new Set(leans.map((l) => `${l.bot_id}:${l.market_id}`));
    for (const p of pairs) {
      if (covered.has(`${p.bot.id}:${p.market.id}`)) continue;
      leans.push({
        bot_id: p.bot.id,
        market_id: p.market.id,
        lean: randomLean(),
        conviction: 1 + Math.floor(Math.random() * 3),
      });
      degradedLeans += 1;
    }

    const flipped = forceDisagreement(leans);

    let leansWritten = 0;
    if (leans.length > 0) {
      const rows = leans.map((l) => ({
        bot_id: l.bot_id,
        market_id: l.market_id,
        lean: l.lean,
        conviction: l.conviction,
        // Per row. Never hoist this out of the map.
        refresh_at: jitteredRefreshAt(),
      }));
      const { error } = await db
        .from('bot_leans')
        .upsert(rows, { onConflict: 'bot_id,market_id' });
      if (error) {
        return ok('lean_upsert_failed', {
          detail: error.message,
          leans_written: 0,
          templates_written: 0,
        });
      }
      leansWritten = rows.length;
    }

    // -- 4. Templates -------------------------------------------------------
    // Only Gemini writes these. There is no random fallback on purpose: the
    // pool is pre-stocked by the migration's seeds, and bot_tick() reuses the
    // oldest-used row when nothing unused is left, so a dry LLM degrades to
    // repeated listings rather than an empty board.
    let templatesWritten = 0;
    if (templateBatch && templatesWanted > 0) {
      const templates = sanitizeTemplates(templateBatch, templatesWanted);
      if (templates.length > 0) {
        const { error } = await db.from('bot_market_templates').insert(templates);
        if (error) {
          console.error('[overvalued] bot-leans: template insert failed:', error.message);
        } else {
          templatesWritten = templates.length;
        }
      }
    }

    return ok(path, {
      active_markets: markets.length,
      bots: bots.length,
      pairs: pairs.length,
      leans_written: leansWritten,
      leans_from_model: leansWritten - degradedLeans,
      leans_randomised: degradedLeans,
      disagreement_flips: flipped,
      unused_templates: unusedTemplates,
      templates_wanted: templatesWanted,
      templates_path: templatePath,
      templates_written: templatesWritten,
    });
  } catch (err) {
    // Last resort. pg_cron gets a 200 no matter what happens in here.
    const detail = err instanceof Error ? err.message : 'unknown';
    console.error('[overvalued] bot-leans: unexpected failure:', detail);
    return ok('unexpected_error', { detail, leans_written: 0, templates_written: 0 });
  }
}

/** pg_cron + pg_net POST here every ~30s. Idempotent; safe to call concurrently. */
export async function POST() {
  return handle();
}

/** Vercel Cron issues GET, so the deploy-time alternative works unchanged. */
export async function GET() {
  return handle();
}
