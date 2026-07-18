'use client';

// /host — unlisted operator console. Not linked from anywhere in the player
// UI; the booth runner types the URL. reset_game() lives behind a two-tap arm.

import { useGame } from '@/components/providers/GameProvider';
import { HostPanel } from '@/components/leaderboard';

export default function HostPage() {
  const { activeCount, markets, player } = useGame();

  return (
    <div className="min-h-dvh bg-ink p-6 font-mono text-sm">
      <h1 className="mb-1 text-xl font-black">OVERVALUED · host</h1>
      <p className="mb-6 text-muted">
        {activeCount} active · {markets.length} total · you are{' '}
        {player?.handle ?? '…'}
      </p>

      <div className="mb-8 space-y-1">
        {markets.map((m) => (
          <div key={m.id} className="flex gap-3 border-b border-line py-1">
            <span className="tnum w-14 shrink-0 text-muted">
              {(m.prob_yes_bps / 100).toFixed(0)}%
            </span>
            <span className="w-20 shrink-0 text-muted">{m.status}</span>
            <span className="w-14 shrink-0">
              {m.is_real === null ? '🔒' : m.is_real ? 'REAL' : 'LARP'}
            </span>
            <span className="truncate">{m.title}</span>
          </div>
        ))}
      </div>

      <HostPanel activeCount={activeCount} />
    </div>
  );
}
