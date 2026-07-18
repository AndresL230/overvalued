'use client';

import { useMemo, useState } from 'react';
import {
  STARTING_CASH,
  fmtBps,
  fmtCents,
  fmtTC,
  type MarketPublic,
  type Player,
} from '@/lib/types';

/**
 * `players` rows carry `is_bot`, which is not part of the frozen `Player`
 * interface. Widen locally rather than touching @/lib/types.
 */
export type LeaderboardPlayer = Player & { is_bot?: boolean };

export interface LeaderboardProps {
  players: LeaderboardPlayer[];
  /** Passed down by Phase C. This component never fetches markets. */
  markets: MarketPublic[];
  currentPlayerId: string;
}

type Tab = 'cash' | 'overvalued' | 'hire';

// Labels are set in the `.sort-tabs` idiom: three equal mono tabs, underlined
// in lime when active. Same control the market queue uses.
const TABS: { id: Tab; label: string; blurb: string }[] = [
  {
    id: 'cash',
    label: 'TRADERS',
    blurb: 'WHO READ THE ROOM BEST',
  },
  {
    id: 'overvalued',
    label: 'OVERVALUED',
    blurb: 'RÉSUMÉS THE CROWD FELL FOR — AND THEY WERE FAKE',
  },
  {
    id: 'hire',
    label: 'HIRE THEM',
    blurb: 'REAL CANDIDATES THE CROWD CORRECTLY SPOTTED',
  },
];

export function Leaderboard({
  players,
  markets,
  currentPlayerId,
}: LeaderboardProps) {
  const [tab, setTab] = useState<Tab>('cash');

  const byCash = useMemo(
    () => [...players].sort((a, b) => b.cash - a.cash),
    [players],
  );

  const resolved = useMemo(
    () => markets.filter((m) => m.status === 'resolved' && m.is_real !== null),
    [markets],
  );

  // The crowd believed a LARP: fake, priced high.
  const overvalued = useMemo(
    () =>
      resolved
        .filter((m) => m.is_real === false)
        .sort((a, b) => b.prob_yes_bps - a.prob_yes_bps),
    [resolved],
  );

  // The crowd correctly spotted a real one.
  const hire = useMemo(
    () =>
      resolved
        .filter((m) => m.is_real === true)
        .sort((a, b) => b.prob_yes_bps - a.prob_yes_bps),
    [resolved],
  );

  const active = TABS.find((t) => t.id === tab);
  const count =
    tab === 'cash' ? byCash.length : tab === 'overvalued' ? overvalued.length : hire.length;

  // The enclosing `.panel-modal` already carries the head and the "Best traders"
  // title, so this renders only the tabs and the board itself.
  return (
    <>
      <div className="leaderboard-tabs">
        <div className="sort-tabs" role="tablist" aria-label="Leaderboard views">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={t.id === tab}
              className={t.id === tab ? 'active' : ''}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="section-heading">
        <span>{active?.blurb}</span>
        <span className="tnum">{count}</span>
      </div>

      {tab === 'cash' && <CashBoard rows={byCash} currentPlayerId={currentPlayerId} />}
      {tab === 'overvalued' && (
        <AwardBoard
          rows={overvalued}
          tone="no"
          emptyLabel="No LARPs have resolved yet."
          captionFor={(m) => `Crowd said ${fmtBps(m.prob_yes_bps)} real — it was fake`}
        />
      )}
      {tab === 'hire' && (
        <AwardBoard
          rows={hire}
          tone="yes"
          emptyLabel="No real candidates have resolved yet."
          captionFor={(m) => `Crowd said ${fmtBps(m.prob_yes_bps)} real — correct`}
        />
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */

function CashBoard({
  rows,
  currentPlayerId,
}: {
  rows: LeaderboardPlayer[];
  currentPlayerId: string;
}) {
  if (rows.length === 0) return <p className="empty-activity">No players yet.</p>;

  return (
    <div className="leaderboard-table">
      {rows.map((p, i) => {
        const isMe = p.id === currentPlayerId;
        const isBot = p.is_bot === true;
        const delta = p.cash - STARTING_CASH;

        return (
          <div
            key={p.id}
            // `.leader` is the stylesheet's lime highlight; bots stay on the
            // board but dimmed, so they never read as beating a human.
            className={[isMe ? 'leader' : '', isBot ? 'bot' : ''].join(' ').trim()}
          >
            <span aria-label={`Rank ${i + 1}`}>{i + 1}</span>
            <span>
              {p.handle}
              {isMe && ' · YOU'}
              {isBot && ' · BOT'}
            </span>
            <span className="tnum">{fmtCents(p.cash)}</span>
            <small className={delta < 0 ? 'negative' : undefined}>
              {delta >= 0 ? '+' : '−'}
              {fmtCents(Math.abs(delta))}
            </small>
          </div>
        );
      })}
    </div>
  );
}

function AwardBoard({
  rows,
  tone,
  emptyLabel,
  captionFor,
}: {
  rows: MarketPublic[];
  tone: 'yes' | 'no';
  emptyLabel: string;
  captionFor: (m: MarketPublic) => string;
}) {
  if (rows.length === 0) return <p className="empty-activity">{emptyLabel}</p>;

  return (
    <div className="award-grid">
      {rows.map((m) => (
        <article key={m.id}>
          <span>
            <b className={tone === 'yes' ? 'yes-text' : 'no-text'}>
              {tone === 'yes' ? 'REAL' : 'LARP'}
            </b>{' '}
            · {fmtBps(m.prob_yes_bps)} · {fmtTC(m.asking_tc)}
          </span>
          <strong>{m.title}</strong>
          <p>{captionFor(m)}</p>
        </article>
      ))}
    </div>
  );
}

export default Leaderboard;
