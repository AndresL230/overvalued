'use client';

import {
  fillCostCents,
  fmtBps,
  fmtCents,
  payoutCents,
  previewBps,
  type Side,
  type TradeAction,
} from '@/lib/types';

export interface CostPreviewProps {
  bps: number;
  side: Side;
  action: TradeAction;
  shares: number;
  /** player cash, in cents */
  cash: number;
  /** shares the player already holds on `side` */
  sharesHeld: number;
  /** market is expired / resolved — trading is off */
  locked?: boolean;
}

/**
 * Single source of truth for "can this order be placed?". TradeSheet uses this
 * for the submit button so the button and the preview can never disagree.
 * Returns null when the order is fine.
 */
export function orderBlockReason(args: {
  bps: number;
  side: Side;
  action: TradeAction;
  shares: number;
  cash: number;
  sharesHeld: number;
}): string | null {
  const { bps, side, action, shares, cash, sharesHeld } = args;
  if (!Number.isInteger(shares) || shares <= 0) {
    return 'shares must be a positive integer';
  }
  if (action === 'buy' && fillCostCents(bps, side, shares) > cash) {
    return 'not enough cash';
  }
  if (action === 'sell' && shares > sharesHeld) {
    return 'you do not own that many shares';
  }
  return null;
}

function Row({
  label,
  value,
  tone = 'default',
  strong = false,
}: {
  label: string;
  value: string;
  tone?: 'default' | 'yes' | 'no' | 'gold' | 'muted';
  strong?: boolean;
}) {
  const toneCls =
    tone === 'yes'
      ? 'text-yes'
      : tone === 'no'
        ? 'text-no'
        : tone === 'gold'
          ? 'text-gold'
          : tone === 'muted'
            ? 'text-muted'
            : 'text-fg';
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[11px] tracking-[0.1em] text-muted uppercase">
        {label}
      </span>
      <span
        className={[
          'tnum',
          strong ? 'text-lg font-black' : 'text-sm font-bold',
          toneCls,
        ].join(' ')}
      >
        {value}
      </span>
    </div>
  );
}

export function CostPreview({
  bps,
  side,
  action,
  shares,
  cash,
  sharesHeld,
  locked,
}: CostPreviewProps) {
  const safeShares = Math.max(0, Math.floor(shares));
  const gross = fillCostCents(bps, side, safeShares);
  const nextBps = previewBps(bps, side, action, safeShares);
  const movedPoints = Math.abs(Math.round(nextBps / 100) - Math.round(bps / 100));
  const movedUp = nextBps > bps;

  const isBuy = action === 'buy';
  const payout = payoutCents(safeShares);
  const profit = payout - gross;
  const cashAfter = isBuy ? cash - gross : cash + gross;
  const heldAfter = isBuy ? sharesHeld + safeShares : sharesHeld - safeShares;

  const blocked = orderBlockReason({
    bps,
    side,
    action,
    shares: safeShares,
    cash,
    sharesHeld,
  });

  const sideCls = side === 'yes' ? 'text-yes' : 'text-no';

  return (
    <div
      className={[
        'rounded-xl border bg-ink/60 p-3.5',
        blocked && !locked ? 'border-no/40' : 'border-line',
      ].join(' ')}
    >
      {/* implied move — the point of the whole game */}
      <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-line bg-surface-2 px-3 py-2.5">
        <span className="text-[10px] tracking-[0.16em] text-muted uppercase">
          You move it
        </span>
        <span className="flex items-baseline gap-2">
          <span className="tnum text-base font-bold text-muted">
            {fmtBps(bps)}
          </span>
          <span className={movedUp ? 'text-yes' : 'text-no'}>→</span>
          <span
            className={[
              'tnum text-xl font-black',
              movedUp ? 'text-yes' : 'text-no',
            ].join(' ')}
          >
            {fmtBps(nextBps)}
          </span>
          <span
            className={[
              'tnum text-[11px] font-bold',
              movedUp ? 'text-yes' : 'text-no',
            ].join(' ')}
          >
            {movedUp ? '+' : '−'}
            {movedPoints}pt
          </span>
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {isBuy ? (
          <>
            <Row label="Cost now" value={fmtCents(gross)} tone="gold" strong />
            <Row
              label={`Payout if ${side === 'yes' ? 'real' : 'larp'}`}
              value={fmtCents(payout)}
              tone="yes"
            />
            <Row
              label="Profit if right"
              value={`+${fmtCents(profit)}`}
              tone="yes"
            />
            <Row
              label="You lose if wrong"
              value={`−${fmtCents(gross)}`}
              tone="no"
            />
          </>
        ) : (
          <>
            <Row label="You receive" value={fmtCents(gross)} tone="gold" strong />
            <Row
              label={`${side.toUpperCase()} left after`}
              value={`${Math.max(0, heldAfter)}`}
              tone="muted"
            />
            <Row
              label="Payout you give up"
              value={fmtCents(payout)}
              tone="muted"
            />
          </>
        )}

        <div className="mt-1 border-t border-line pt-2">
          <Row
            label="Cash after"
            value={fmtCents(cashAfter)}
            tone={cashAfter < 0 ? 'no' : 'default'}
          />
        </div>
      </div>

      {locked ? (
        <p className="mt-3 rounded-lg border border-hot/40 bg-hot/10 px-3 py-2 text-center text-[11px] font-bold tracking-[0.12em] text-hot uppercase">
          reference check in progress
        </p>
      ) : blocked ? (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-no/40 bg-no/10 px-3 py-2 text-center text-[12px] font-bold text-no"
        >
          {blocked}
        </p>
      ) : (
        <p className="mt-3 text-center text-[10px] tracking-[0.14em] text-muted uppercase">
          {safeShares} <span className={sideCls}>{side}</span> ·{' '}
          {isBuy ? 'buy' : 'sell'} · marginal price fills the whole order
        </p>
      )}
    </div>
  );
}

export default CostPreview;
