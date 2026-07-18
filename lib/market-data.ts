export type MarketStatus = "active" | "resolved";

export type Market = {
  id: string;
  handle: string;
  title: string;
  askingTc: string;
  probability: number;
  change: number;
  closesIn: number;
  claims: string[];
  history: number[];
  sharesTraded: number;
  status: MarketStatus;
  isReal: boolean;
};

export type TradeTapeItem = {
  id: string;
  handle: string;
  action: "BOUGHT" | "SOLD";
  shares: number;
  side: "YES" | "NO";
  marketId: string;
  price: number;
};

export const initialMarkets: Market[] = [
  {
    id: "OV-042",
    handle: "@latency_lord",
    title: "Founding engineer who scaled AI infra to 10M users before graduation",
    askingTc: "$420K",
    probability: 67,
    change: 12,
    closesIn: 137,
    claims: [
      "Rewrote auth in Rust during a layover",
      "Turned down two acquihires on principle",
      "Maintains a small but active Substack",
    ],
    history: [48, 49, 52, 51, 54, 56, 53, 58, 57, 61, 59, 63, 65, 62, 64, 67],
    sharesTraded: 284,
    status: "active",
    isReal: true,
  },
  {
    id: "OV-017",
    handle: "@deck_destroyer",
    title: "Chief Vibes Officer who shipped a Figma plugin with 14 installs",
    askingTc: "$310K",
    probability: 38,
    change: -8,
    closesIn: 262,
    claims: [
      "Owned culture across three Slack channels",
      "Rebuilt onboarding entirely in Notion",
      "Ran a design sprint with no designers",
    ],
    history: [51, 50, 49, 46, 48, 45, 43, 44, 42, 39, 41, 40, 37, 39, 38, 38],
    sharesTraded: 191,
    status: "active",
    isReal: false,
  },
  {
    id: "OV-031",
    handle: "@devday_adjacent",
    title: "Ex-OpenAI-adjacent growth hacker who attended DevDay",
    askingTc: "$500K",
    probability: 22,
    change: -19,
    closesIn: 389,
    claims: [
      "Built an AI wrapper before wrappers were cool",
      "Drove 900% week-over-week waitlist growth",
      "Has Sam Altman in their extended network",
    ],
    history: [50, 48, 45, 46, 42, 40, 36, 38, 34, 31, 30, 28, 27, 25, 23, 22],
    sharesTraded: 417,
    status: "active",
    isReal: false,
  },
  {
    id: "OV-009",
    handle: "@stealth_mode_x3",
    title: "Solo founder with three stealth startups and zero LinkedIn dates",
    askingTc: "$390K",
    probability: 54,
    change: 4,
    closesIn: 511,
    claims: [
      "Reached default-alive twice in one quarter",
      "Built a proprietary founder-mode framework",
      "Currently pre-announcement, post-product",
    ],
    history: [50, 49, 51, 52, 50, 51, 53, 52, 55, 54, 56, 55, 53, 54, 55, 54],
    sharesTraded: 128,
    status: "active",
    isReal: true,
  },
  {
    id: "OV-026",
    handle: "@actually_ships",
    title: "Compiler engineer who built the tool everyone in this room uses",
    askingTc: "$230K",
    probability: 84,
    change: 21,
    closesIn: 648,
    claims: [
      "Merged 63 production pull requests this month",
      "Answers bug reports before anyone tags them",
      "Did not put visionary in the bio",
    ],
    history: [51, 54, 57, 59, 62, 61, 65, 68, 70, 72, 73, 76, 78, 81, 82, 84],
    sharesTraded: 362,
    status: "active",
    isReal: true,
  },
  {
    id: "OV-054",
    handle: "@arr_maxxer",
    title: "YC applicant who counts waitlist signups as recurring revenue",
    askingTc: "$475K",
    probability: 17,
    change: -14,
    closesIn: 794,
    claims: [
      "Booked $2M in non-binding pipeline",
      "Pivoted four times without losing velocity",
      "Customer discovery includes both roommates",
    ],
    history: [49, 46, 43, 44, 40, 38, 36, 34, 31, 29, 27, 25, 24, 21, 19, 17],
    sharesTraded: 506,
    status: "active",
    isReal: false,
  },
];

export const initialTape: TradeTapeItem[] = [
  {
    id: "t-1",
    handle: "@margin_goblin",
    action: "BOUGHT",
    shares: 6,
    side: "YES",
    marketId: "OV-042",
    price: 65,
  },
  {
    id: "t-2",
    handle: "@shipit_sam",
    action: "BOUGHT",
    shares: 10,
    side: "NO",
    marketId: "OV-031",
    price: 76,
  },
  {
    id: "t-3",
    handle: "@series_seed",
    action: "SOLD",
    shares: 4,
    side: "YES",
    marketId: "OV-017",
    price: 39,
  },
  {
    id: "t-4",
    handle: "@compile_me",
    action: "BOUGHT",
    shares: 8,
    side: "YES",
    marketId: "OV-026",
    price: 82,
  },
];

export const leaderboard = [
  { rank: 1, handle: "@margin_goblin", value: "$143.80", move: "+43.8%" },
  { rank: 2, handle: "@series_seed", value: "$129.45", move: "+29.4%" },
  { rank: 3, handle: "@compile_me", value: "$118.20", move: "+18.2%" },
  { rank: 4, handle: "@shipit_sam", value: "$109.65", move: "+9.6%" },
  { rank: 5, handle: "@deck_destroyer", value: "$102.40", move: "+2.4%" },
];

export function formatCountdown(totalSeconds: number) {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}
