'use client';

import { useMemo, useState } from 'react';
import {
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

const TABS: { id: Tab; label: string; blurb: string }[] = [
  {
    id: 'cash',
    label: 'Fattest Portfolio',
    blurb: 'Who read the room best',
  },
  {
    id: 'overvalued',
    label: 'Most Overvalued',
    blurb: 'Résumés the crowd fell for — and they were fake',
  },
  {
    id: 'hire',
    label: 'Actually Hire This Person',
    blurb: 'Real candidates the crowd correctly spotted',
  },
];

const MEDALS = ['1', '2', '3'];

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

  return (
    <section className="rounded-xl border border-line bg-surface">
      <header className="border-b border-line px-4 pt-4 pb-3">
        <h2 className="text-[11px] font-black tracking-[0.34em] text-gold uppercase">
          Leaderboard
        </h2>

        <div
          role="tablist"
          aria-label="Leaderboard views"
          className="mt-3 flex flex-wrap gap-1.5"
        >
          {TABS.map((t) => {
            const on = t.id === tab;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={on}
                onClick={() => setTab(t.id)}
                className={[
                  'rounded-md px-2.5 py-1.5 text-[10px] font-bold tracking-[0.14em] uppercase transition-colors',
                  on
                    ? 'bg-surface-2 text-fg ring-1 ring-gold/50'
                    : 'text-muted hover:bg-surface-2 hover:text-fg',
                ].join(' ')}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        <p className="mt-2 text-[10px] tracking-[0.12em] text-muted uppercase">
          {TABS.find((t) => t.id === tab)?.blurb}
        </p>
      </header>

      <div className="p-2">
        {tab === 'cash' && (
          <CashBoard rows={byCash} currentPlayerId={currentPlayerId} />
        )}
        {tab === 'overvalued' && (
          <MarketBoard
            rows={overvalued}
            tone="no"
            emptyLabel="No LARPs have resolved yet."
            captionFor={(m) =>
              `Crowd said ${fmtBps(m.prob_yes_bps)} REAL — it was fake`
            }
          />
        )}
        {tab === 'hire' && (
          <MarketBoard
            rows={hire}
            tone="yes"
            emptyLabel="No real candidates have resolved yet."
            captionFor={(m) =>
              `Crowd said ${fmtBps(m.prob_yes_bps)} REAL — correct`
            }
          />
        )}
      </div>
    </section>
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
  if (rows.length === 0) return <Empty label="No players yet." />;

  return (
    <ol className="flex flex-col gap-1">
      {rows.map((p, i) => {
        const isMe = p.id === currentPlayerId;
        const isBot = p.is_bot === true;
        const medal = i < 3 ? MEDALS[i] : null;

        return (
          <li
            key={p.id}
            className={[
              'flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors',
              isMe
                ? 'bg-surface-2 ring-1 ring-gold/60'
                : 'hover:bg-surface-2/60',
              // bots stay on the board but must not out-read humans
              isBot && !isMe ? 'opacity-45' : '',
            ].join(' ')}
          >
            <span
              className={[
                'tnum w-7 shrink-0 text-center text-sm font-black',
                medal ? 'text-gold' : 'text-muted',
              ].join(' ')}
              aria-label={`Rank ${i + 1}`}
            >
              {medal ?? i + 1}
            </span>

            <span className="min-w-0 flex-1 truncate text-sm font-bold text-fg">
              {p.handle}
              {isMe && (
                <span className="ml-2 rounded bg-gold/20 px-1.5 py-0.5 text-[9px] font-black tracking-[0.16em] text-gold uppercase">
                  You
                </span>
              )}
              {isBot && (
                <span className="ml-2 text-[9px] font-bold tracking-[0.16em] text-muted uppercase">
                  Bot
                </span>
              )}
            </span>

            <span
              className={[
                'tnum shrink-0 text-base font-black',
                i < 3 ? 'text-gold' : 'text-fg',
              ].join(' ')}
            >
              {fmtCents(p.cash)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function MarketBoard({
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
  if (rows.length === 0) return <Empty label={emptyLabel} />;

  const accent = tone === 'yes' ? 'text-yes' : 'text-no';
  const stampBorder = tone === 'yes' ? 'border-yes/50' : 'border-no/50';

  return (
    <ol className="flex flex-col gap-1">
      {rows.map((m, i) => (
        <li
          key={m.id}
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-surface-2/60"
        >
          <span
            className={[
              'tnum w-7 shrink-0 text-center text-sm font-black',
              i < 3 ? 'text-gold' : 'text-muted',
            ].join(' ')}
          >
            {i < 3 ? MEDALS[i] : i + 1}
          </span>

          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold text-fg">
              {m.title}
            </span>
            <span className="tnum mt-0.5 block truncate text-[10px] tracking-[0.1em] text-muted uppercase">
              {fmtTC(m.asking_tc)} · {captionFor(m)}
            </span>
          </span>

          <span className="flex shrink-0 flex-col items-end gap-1">
            <span className={`tnum text-base font-black ${accent}`}>
              {fmtBps(m.prob_yes_bps)}
            </span>
            <span
              className={[
                'border px-1.5 text-[9px] font-black tracking-[0.16em] uppercase',
                stampBorder,
                accent,
              ].join(' ')}
            >
              {tone === 'yes' ? 'Real' : 'Larp'}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <p className="px-3 py-10 text-center text-[11px] tracking-[0.16em] text-muted uppercase">
      {label}
    </p>
  );
}

export default Leaderboard;
