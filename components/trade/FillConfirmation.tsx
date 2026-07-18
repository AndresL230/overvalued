'use client';

import { useEffect } from 'react';
import { fmtBps, fmtCents, type Side, type TradeAction } from '@/lib/types';

export interface FillConfirmationProps {
  shares: number;
  side: Side;
  action: TradeAction;
  /** price actually filled at, in cents (from the RPC when available) */
  priceCents: number;
  /** probability before the fill */
  fromBps: number;
  /** probability after the fill, straight from the RPC */
  toBps: number;
  onDone: () => void;
  /** auto-dismiss delay; defaults to 2.5s */
  durationMs?: number;
}

export function FillConfirmation({
  shares,
  side,
  action,
  priceCents,
  fromBps,
  toBps,
  onDone,
  durationMs = 2500,
}: FillConfirmationProps) {
  useEffect(() => {
    const t = setTimeout(onDone, durationMs);
    return () => clearTimeout(t);
  }, [onDone, durationMs]);

  const up = toBps > fromBps;
  const points = Math.abs(Math.round(toBps / 100) - Math.round(fromBps / 100));
  const total = priceCents * shares;
  const sideCls = side === 'yes' ? 'text-yes' : 'text-no';
  const borderCls = side === 'yes' ? 'border-yes/50' : 'border-no/50';

  return (
    <div
      role="status"
      aria-live="assertive"
      className={[
        'rounded-xl border-2 p-5 text-center',
        borderCls,
        up ? 'flash-up' : 'flash-down',
      ].join(' ')}
    >
      <p className="stamp text-[11px] font-black tracking-[0.34em] text-gold uppercase">
        Filled
      </p>

      <p className="tnum mt-2 text-3xl leading-tight font-black">
        <span className="text-fg">{shares}</span>{' '}
        <span className={sideCls}>{side.toUpperCase()}</span>{' '}
        <span className="text-muted">@</span>{' '}
        <span className="text-fg">{priceCents}¢</span>
      </p>

      <p className="tnum mt-1 text-sm font-bold text-gold">
        {action === 'buy' ? `−${fmtCents(total)}` : `+${fmtCents(total)}`}
        <span className="ml-1.5 text-[10px] tracking-[0.14em] text-muted uppercase">
          {action === 'buy' ? 'paid' : 'received'}
        </span>
      </p>

      <div className="mt-4 flex items-center justify-center gap-2.5 border-t border-line pt-3.5">
        <span className="tnum text-base font-bold text-muted">
          {fmtBps(fromBps)}
        </span>
        <span className={up ? 'text-yes' : 'text-no'}>→</span>
        <span
          className={[
            'tnum text-2xl font-black',
            up ? 'text-yes' : 'text-no',
          ].join(' ')}
        >
          {fmtBps(toBps)}
        </span>
      </div>

      <p className="mt-2 text-[11px] tracking-[0.12em] text-muted uppercase">
        {points > 0 ? (
          <>
            You moved the market{' '}
            <span
              className={['tnum font-black', up ? 'text-yes' : 'text-no'].join(
                ' ',
              )}
            >
              {points} point{points === 1 ? '' : 's'} {up ? 'up' : 'down'}
            </span>
          </>
        ) : (
          <>Market held at the {up ? 'ceiling' : 'floor'}</>
        )}
      </p>
    </div>
  );
}

export default FillConfirmation;
