// ============================================================================
// OVERVALUED — cursed résumé generator.
// Pure functions. No React, no side effects, deterministic given an Rng.
//
// HOUSE RULE (enforced by the UI copy, not by code): you only ever list
// YOUR OWN résumé. Nobody lists anyone else. These are self-parody kits.
// ============================================================================

export type Rng = () => number;
export type Flavor = 'real' | 'larp';

export interface Resume {
  title: string;
  bullets: string[];
  askingTc: number; // whole dollars, e.g. 450000
}

// --- rng utilities ----------------------------------------------------------

/** mulberry32 — small, fast, good enough for jokes. Seed it for repeatability. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(pool: readonly T[], r: Rng): T {
  return pool[Math.floor(r() * pool.length)];
}

/** n distinct items, in random order. Clamped to the pool size. */
function pickMany<T>(pool: readonly T[], n: number, r: Rng): T[] {
  const copy = pool.slice();
  const out: T[] = [];
  const take = Math.min(n, copy.length);
  for (let i = 0; i < take; i++) {
    out.push(copy.splice(Math.floor(r() * copy.length), 1)[0]);
  }
  return out;
}

function int(min: number, max: number, r: Rng): number {
  return min + Math.floor(r() * (max - min + 1));
}

function chance(p: number, r: Rng): boolean {
  return r() < p;
}

// --- title fragments --------------------------------------------------------

/** Sits directly in front of {buzzword} {noun}: "Chief Vibes Architect". */
export const SENIORITY_PREFIX = [
  'Chief',
  'Founding',
  'Principal',
  'Staff',
  'Senior Staff',
  'Distinguished',
  'Interim',
  'Acting',
  'Deputy',
  'Fractional',
  'Global',
  'Regional',
  'Executive',
  'Associate',
  'Lead',
  'Group',
  'Shadow',
  'Emeritus',
  'Provisional',
  'Founding Senior',
] as const;

/** Takes the "X of Y" shape: "Global Head of Synergy". */
export const SENIORITY_HEAD_OF = [
  'Head of',
  'Global Head of',
  'VP of',
  'SVP of',
  'Director of',
  'Vice President of',
  'Deputy Head of',
  'Interim Head of',
  'Fractional VP of',
  'Regional Director of',
  'Executive Director of',
  'Group Head of',
  'Chief of Staff for',
] as const;

export const BUZZWORDS = [
  'Vibes',
  'Synergy',
  'Growth',
  'Prompt',
  'Platform',
  'Narrative',
  'Ecosystem',
  'Agentic',
  'Culture',
  'Innovation',
  'Thought',
  'Alignment',
  'Velocity',
  'Impact',
  'Community',
  'Strategy',
  'Ontology',
  'Latency',
  'Momentum',
  'Discourse',
  'Trust & Safety',
  'Zero-Trust',
  'Retention',
  'Delight',
  'Founder-Mode',
  'Chaos',
  'Blockchain',
  'Developer Experience',
  'Vision',
  'Taste',
  'Signal',
  'Onboarding',
  'Storytelling',
  'Enablement',
  'Transformation',
  'Web3',
] as const;

export const TITLE_NOUNS = [
  'Architect',
  'Engineer',
  'Officer',
  'Evangelist',
  'Ninja',
  'Wizard',
  'Operator',
  'Steward',
  'Custodian',
  'Whisperer',
  'Strategist',
  'Alchemist',
  'Sherpa',
  'Czar',
  'Catalyst',
  'Curator',
  'Technologist',
  'Partner',
  'Generalist',
  'Specialist',
  'Scientist',
  'Practitioner',
  'Advocate',
  'Guru',
  'Janitor',
  'Correspondent',
  'Anthropologist',
  'Auteur',
] as const;

export const TITLE_SUFFIXES = [
  '(IC)',
  '(self-appointed)',
  '(interim)',
  '(unpaid)',
  '(no reports)',
  '(contract-to-hire)',
  '(part-time)',
  'II',
  'III',
  ', Level 7',
  '& Founder',
  '& Head of Thought',
  '& Chief of Staff to Myself',
  '— 2 direct reports, both interns',
  '— title negotiated, comp was not',
  ', formerly Head of Everything',
] as const;

// --- bullets ----------------------------------------------------------------

type BulletGen = string | ((r: Rng) => string);

/** Quietly plausible. These are the ones that make the room hesitate. */
export const REAL_BULLETS: readonly BulletGen[] = [
  (r) => `Cut p99 latency ${int(180, 900, r)}ms → ${int(11, 90, r)}ms`,
  (r) => `Reduced CI from ${int(18, 55, r)} min to ${int(3, 11, r)} min by deleting one test`,
  (r) => `Deleted ${int(8, 60, r)}k lines of code, added ${int(200, 900, r)}. Net negative, deeply proud.`,
  (r) => `Migrated ${int(3, 14, r)} services off a Postgres box named \`prod-final-2\``,
  (r) => `Cut cloud spend ${int(22, 61, r)}% by turning off a staging cluster from 2019`,
  (r) => `Scaled a Discord to ${int(30, 120, r)}k members (${int(25, 110, r)}k bots)`,
  (r) => `Debugged a race condition for ${int(2, 7, r)} weeks; the fix was one line`,
  (r) => `Onboarded ${int(9, 40, r)} engineers; ${int(2, 6, r)} are still here`,
  (r) => `Hit ${int(80, 96, r)}% test coverage by lowering the threshold`,
  (r) => `Rewrote the auth flow; incidents dropped ${int(40, 88, r)}%`,
  (r) => `Named in ${int(4, 19, r)} postmortems, blamed in zero`,
  (r) => `Shipped on a Friday ${int(11, 40, r)} times, rolled back ${int(2, 9, r)}`,
  (r) => `Was the entire data team for ${int(7, 22, r)} months`,
  (r) => `Took a legacy job queue from ${int(88, 96, r)}% to ${int(99, 100, r)}% delivery`,
  (r) => `Turned a spreadsheet into a product doing $${int(120, 900, r)}k ARR`,
  (r) => `Answered ${int(400, 3000, r)} support tickets before anyone noticed I wasn't support`,
  (r) => `Kept a 12-year-old jQuery admin panel alive through ${int(2, 4, r)} acquisitions`,
  (r) => `Ran a ${int(4, 11, r)}-person team through two reorgs and one rename`,
  'Owned the on-call rotation nobody else would touch',
  'Wrote the RFC that killed the thing I was hired to build',
  'Built the internal tool that replaced my own job',
  'Maintained a library several companies depend on and nobody funds',
  'Presented to the board on four hours of sleep and no slides',
  'Interned somewhere you have heard of, did nothing you have heard of',
  'Won a hackathon with a demo held together by one hardcoded array',
  'Fixed the bug in production, from a phone, at a wedding',
  'Read the entire codebase. Understood roughly a third of it.',
  'Shipped the migration at 3am and told nobody until it held',
  'Convinced legal to let us open-source it, which took longer than building it',
  'Left better documentation than I found, which was none',
];

/** Load-bearing nonsense. Delivered deadpan, which is the joke. */
export const LARP_BULLETS: readonly BulletGen[] = [
  (r) => `Owned "culture" at a ${int(4, 9, r)}-person startup that never shipped`,
  (r) => `Advised ${int(6, 22, r)} pre-seed startups, all now pivoting to agents`,
  (r) => `Ran a newsletter with ${int(3, 40, r)}k subscribers and ${int(2, 9, r)} readers`,
  (r) => `Founded and dissolved ${int(2, 5, r)} LLCs in a single fiscal year`,
  (r) => `Spent ${int(8, 26, r)} months in stealth. Left in stealth.`,
  (r) => `Grew a Slack workspace to ${int(140, 600, r)} channels and ${pick(['zero', 'one', 'two'], r)} decisions`,
  (r) => `Reduced meeting load ${int(60, 95, r)}% by not being invited`,
  (r) => `Cited in a Medium post with ${int(3, 40, r)} claps`,
  (r) => `Certified in a framework I invented ${int(2, 6, r)} weeks earlier`,
  (r) => `Pitched the same deck to ${int(20, 70, r)} VCs under ${int(2, 4, r)} company names`,
  (r) => `Mentored ${int(5, 18, r)} juniors, all of whom now out-earn me`,
  (r) => `Sat on ${int(3, 9, r)} advisory boards, attended ${pick(['zero', 'one'], r)} meetings`,
  (r) => `Have ${int(9, 60, r)}k LinkedIn followers and ${pick(['zero', 'one', 'two'], r)} references`,
  (r) => `Was "employee #4" at a company with ${int(2, 3, r)} employees`,
  (r) => `Drove a digital transformation that turned out to be renaming ${int(1, 3, r)} folders`,
  'Coined an internal term that outlived the company',
  'Personally responsible for the phrase "let\'s take this offline"',
  'Held the title "Chief of Staff to the Chief of Staff"',
  'Introduced OKRs. Was asked to leave.',
  'Turned down an offer I did not receive',
  'Keynoted a conference I organized',
  'Managed a P&L I was never shown',
  'Built an AI agent that emails other AI agents. Both are billing us.',
  'Held equity in something. Unclear what. Unclear how much.',
  'Ran "strategy" for a product that was one Airtable',
  'Named a conference room. That is the contribution.',
  'Rebranded the company twice; the product shipped zero times',
  'Wrote a thought-leadership post that got me an interview I failed',
  'Said "we are not a startup, we are a movement" out loud, on camera',
  'Was on the founding team of a Notion page',
  'Consulted for a client who has never confirmed this',
  'Sold a course about the job I have not held',
];

function renderBullet(b: BulletGen, r: Rng): string {
  return typeof b === 'function' ? b(r) : b;
}

// --- asking TC --------------------------------------------------------------

/** Round numbers with a whiff of delusion. All within 180k–900k. */
const TC_BASES = [
  180, 195, 200, 215, 225, 240, 250, 265, 275, 300, 320, 333, 350, 365, 375,
  400, 410, 420, 425, 450, 469, 480, 500, 525, 550, 575, 600, 625, 650, 666,
  690, 700, 725, 750, 777, 800, 850, 875, 888, 900,
] as const;

/** A cursed round number in [180000, 900000]. */
export function randomAskingTc(rng: Rng = Math.random): number {
  const base = pick(TC_BASES, rng) * 1000;
  // sometimes a suspiciously precise tail, because they "did the math"
  const tail = chance(0.28, rng) ? pick([69, 420, 1, 500, 250], rng) : 0;
  return Math.min(900000, Math.max(180000, base + tail));
}

// --- title ------------------------------------------------------------------

export function randomTitle(flavor?: Flavor, rng: Rng = Math.random): string {
  const buzz = pick(BUZZWORDS, rng);
  const noun = pick(TITLE_NOUNS, rng);
  // LARP titles run longer and dumber; REAL titles stay hireable.
  const roll = rng();
  const grandiose = flavor === 'larp' ? 0.62 : flavor === 'real' ? 0.24 : 0.44;

  let title: string;
  if (roll < 0.34) {
    title = `${pick(SENIORITY_HEAD_OF, rng)} ${buzz}`;
  } else if (roll < 0.62) {
    title = `${pick(SENIORITY_PREFIX, rng)} ${buzz} ${noun}`;
  } else if (roll < 0.82) {
    title = `${pick(SENIORITY_HEAD_OF, rng)} ${buzz} ${noun}`;
  } else {
    const [b1, b2] = pickMany(BUZZWORDS, 2, rng);
    title = `${pick(SENIORITY_PREFIX, rng)} ${b1} ${noun} & ${pick(SENIORITY_HEAD_OF, rng)} ${b2}`;
  }

  if (chance(grandiose * 0.55, rng) && !title.includes('&')) {
    title = `${title} ${pick(TITLE_SUFFIXES, rng)}`;
  }
  return title;
}

// --- bullets ----------------------------------------------------------------

/**
 * `count` distinct bullets. Flavor biases the pool but always leaves a little
 * contamination — a real résumé with one absurd line is the funniest object
 * in the room, and it is what makes the market genuinely hard to price.
 */
export function randomBullets(
  flavor?: Flavor,
  rng: Rng = Math.random,
  count = 4,
): string[] {
  const n = Math.max(1, Math.min(5, count));
  const primary = flavor === 'larp' ? LARP_BULLETS : REAL_BULLETS;
  const secondary = flavor === 'larp' ? REAL_BULLETS : LARP_BULLETS;
  // exactly one contaminating line when a flavor is asked for; a looser mix
  // when it is not. The spice is never the majority.
  const spice = flavor ? 1 : int(1, 2, rng);

  const fromSecondary = Math.max(0, Math.min(n - 1, spice));
  const fromPrimary = n - fromSecondary;

  const chosen = [
    ...pickMany(primary, fromPrimary, rng),
    ...pickMany(secondary, fromSecondary, rng),
  ];

  // shuffle so the spice is not always at the bottom
  for (let i = chosen.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [chosen[i], chosen[j]] = [chosen[j], chosen[i]];
  }

  const out: string[] = [];
  for (const b of chosen) {
    const line = renderBullet(b, rng);
    if (!out.includes(line)) out.push(line);
  }
  return out;
}

// --- the whole kit ----------------------------------------------------------

/** One freshly cursed résumé. Deterministic for a given rng. */
export function randomResume(flavor?: Flavor, rng: Rng = Math.random): Resume {
  return {
    title: randomTitle(flavor, rng),
    bullets: randomBullets(flavor, rng, int(3, 5, rng)),
    askingTc: randomAskingTc(rng),
  };
}

// --- input parsing ----------------------------------------------------------

/**
 * "450k" | "450,000" | "$450K" | "1.2m" -> 450000 / 450000 / 450000 / 1200000
 * Returns null if it is not a positive integer amount. Never returns a float.
 */
export function parseAskingTc(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(/[$,\s_]/g, '');
  if (!s) return null;

  const m = /^(\d+(?:\.\d+)?)([km])?$/.exec(s);
  if (!m) return null;

  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;

  const mult = m[2] === 'm' ? 1_000_000 : m[2] === 'k' ? 1000 : 1;
  const total = Math.round(n * mult);
  return total > 0 ? total : null;
}
