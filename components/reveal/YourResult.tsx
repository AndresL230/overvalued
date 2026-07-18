'use client';

import { fmtCents, payoutCents } from '@/lib/types';

export interface YourResultProps {
  /**
   * The position this player held BEFORE resolution wiped it.
   * Positions are DELETED on resolve — the caller must have captured this
   * ahead of time. Never try to fetch it after the fact.
   */
  held: { yes: number; no: number };
  /** true = REAL (YES pays), false = LARP (NO pays). */
  isReal: boolean;
}

/**
 * The personal slice of the reveal: what the player was holding and what it
 * just became. Sits inside RevealModal.
 */
export function YourResult({ held, isReal }: YourResultProps) {
  const yes = Math.max(0, held.yes | 0);
  const no = Math.max(0, held.no | 0);

  if (yes === 0 && no === 0) {
    return (
      <div className="rounded-lg border border-line bg-surface/60 px-4 py-3 text-center">
        <p className="text-[10px] font-bold tracking-[0.28em] text-muted uppercase">
          Your book
        </p>
        <p className="mt-1 text-sm font-semibold text-muted">
          You sat this one out.
        </p>
      </div>
    );
  }

  const winningShares = isReal ? yes : no;
  const losingShares = isReal ? no : yes;
  const paid = payoutCents(winningShares);
  const won = paid > 0;

  return (
    <div
      className={[
        'rounded-lg border-2 px-4 py-3 text-center',
        won ? 'border-yes/50 bg-yes/10' : 'border-no/40 bg-no/10',
      ].join(' ')}
    >
      <p className="text-[10px] font-bold tracking-[0.28em] text-muted uppercase">
        Your book
      </p>

      <p className="mt-1.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-lg font-black">
        <span className="text-muted">You held</span>
        {yes > 0 && (
          <span className="tnum text-yes">
            {yes} YES
          </span>
        )}
        {yes > 0 && no > 0 && <span className="text-muted">·</span>}
        {no > 0 && (
          <span className="tnum text-no">
            {no} NO
          </span>
        )}
        <span className={won ? 'text-yes' : 'text-no'}>→</span>
        <span
          className={[
            'tnum text-2xl',
            won ? 'text-gold' : 'text-no',
          ].join(' ')}
        >
          {won ? `+${fmtCents(paid)}` : fmtCents(0)}
        </span>
      </p>

      <p className="mt-1 text-[11px] tracking-[0.12em] text-muted uppercase">
        {won ? (
          <>
            {winningShares} winning share{winningShares === 1 ? '' : 's'} @ $1.00
            {losingShares > 0 && (
              <>
                {' '}
                · {losingShares} worthless
              </>
            )}
          </>
        ) : (
          <>{losingShares} share{losingShares === 1 ? '' : 's'} expired worthless</>
        )}
      </p>
    </div>
  );
}

export default YourResult;
