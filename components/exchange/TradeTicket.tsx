'use client';

// ============================================================================
// EXCHANGE lane — the quick ticket.
//
// Ported from codex/clean-trade-modal's trade modal, but placing real orders
// through the `trade` RPC instead of mutating local fixtures.
//
// On validation: the database is the authority. It re-checks cash, holdings,
// share count and market status, and returns player-facing error strings
// (CONTRACT.md §"Error strings trade() can return"). This component clamps to
// keep the UI honest and the buttons sensible; it does not attempt to be the
// gatekeeper. A slip here surfaces as a rejected order, not bad state.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  fmtCents,
  fmtCountdown,
  msUntil,
  priceForSide,
  priceNoCents,
  priceYesCents,
  type MarketPublic,
  type Side,
  type TradeAction,
  type TradeResult,
} from '@/lib/types';
import { atHandle, marketCode } from './useExchangeData';

/** Buying the whole book with one tap is not a fun booth mechanic. */
const MAX_QUICK_SHARES = 50;

export function TradeTicket({
  market,
  playerId,
  cash,
  held,
  side,
  onSide,
  onClose,
  onFilled,
}: {
  market: MarketPublic;
  playerId: string;
  cash: number;
  held: { yes: number; no: number };
  side: Side;
  onSide: (side: Side) => void;
  onClose: () => void;
  onFilled: (msg: string) => void;
}) {
  const [action, setAction] = useState<TradeAction>('buy');
  const [shares, setShares] = useState(5);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  // Focus the ticket on open, hand focus back to whatever opened it on close.
  useEffect(() => {
    openerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => closeRef.current?.focus({ preventScroll: true }));
    return () => {
      cancelAnimationFrame(frame);
      openerRef.current?.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const bps = market.prob_yes_bps;
  const yes = priceYesCents(bps);
  const no = priceNoCents(bps);
  const price = priceForSide(bps, side);
  const owned = side === 'yes' ? held.yes : held.no;

  const total = price * shares;
  const payout = shares * 100;

  const affordable = price > 0 ? Math.floor(cash / price) : 0;
  const ceiling = action === 'buy' ? affordable : owned;

  const notEnoughCash = action === 'buy' && total > cash;
  const notEnoughShares = action === 'sell' && shares > owned;
  const expired = msUntil(market.expires_at) <= 0 || market.status === 'resolved';
  const blocked = shares < 1 || notEnoughCash || notEnoughShares || expired;

  const submit = useCallback(async () => {
    if (blocked || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const { data: raw, error: rpcErr } = await supabase.rpc('trade', {
        p_player: playerId,
        p_market: market.id,
        p_side: side,
        p_action: action,
        p_shares: shares,
      });
      if (rpcErr) {
        setError(rpcErr.message);
        return;
      }
      const res = raw as unknown as TradeResult;
      if (!res || !res.ok) {
        // The database's wording is already player-facing — show it verbatim.
        setError(res?.error ?? 'trade failed');
        return;
      }
      const filled = res.shares ?? shares;
      const at = res.price_cents ?? price;
      onFilled(
        `FILLED · ${action === 'buy' ? 'BOUGHT' : 'SOLD'} ${filled} ${side.toUpperCase()} @ ${at}¢`,
      );
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'trade failed');
    } finally {
      setSubmitting(false);
    }
  }, [blocked, submitting, playerId, market.id, side, action, shares, price, onFilled, onClose]);

  return (
    <aside
      className="trade-ticket trade-ticket--open"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`ticket-title-${market.id}`}
    >
      <span className="trade-sheet-grabber" aria-hidden="true" />
      <div className="trade-ticket__head">
        <span>QUICK TICKET</span>
        <button ref={closeRef} onClick={onClose} aria-label="Close trade ticket">
          CLOSE ×
        </button>
      </div>

      <div className="ticket-context">
        <span>{marketCode(market.id)} · REFERENCE CHECK</span>
        <h2 id={`ticket-title-${market.id}`}>{market.title}</h2>
        <div>
          <span>{atHandle('you')}</span>
          <span>CLOSES {fmtCountdown(msUntil(market.expires_at))}</span>
        </div>
      </div>

      <div className="ticket-mode" role="group" aria-label="Buy or sell">
        {(['buy', 'sell'] as TradeAction[]).map((m) => (
          <button
            key={m}
            aria-pressed={action === m}
            className={action === m ? 'active' : ''}
            onClick={() => {
              setAction(m);
              setError(null);
              // Selling more than you hold is the most common mis-tap here.
              if (m === 'sell') setShares((s) => Math.max(1, Math.min(s, owned || 1)));
            }}
          >
            {m.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="side-selector" role="group" aria-label="Choose outcome">
        <button
          aria-pressed={side === 'yes'}
          className={side === 'yes' ? 'active yes' : ''}
          onClick={() => {
            onSide('yes');
            setError(null);
          }}
        >
          <span>YES · PASSES</span>
          <strong>{yes}¢</strong>
        </button>
        <button
          aria-pressed={side === 'no'}
          className={side === 'no' ? 'active no' : ''}
          onClick={() => {
            onSide('no');
            setError(null);
          }}
        >
          <span>NO · LARP</span>
          <strong>{no}¢</strong>
        </button>
      </div>

      <div className="ticket-section-label">
        <span>CONTRACTS</span>
        <span>OWNED {owned}</span>
      </div>
      <div className="share-stepper">
        <button onClick={() => setShares((s) => Math.max(1, s - 1))} aria-label="Decrease contracts">
          −
        </button>
        <label>
          <span className="sr-only">Number of contracts</span>
          <input
            type="number"
            min="1"
            value={shares}
            onChange={(e) => setShares(Math.max(1, Number(e.target.value) || 1))}
          />
        </label>
        <button onClick={() => setShares((s) => s + 1)} aria-label="Increase contracts">
          +
        </button>
      </div>
      <div className="quick-amounts">
        {[1, 5, 10].map((n) => (
          <button key={n} onClick={() => setShares(n)}>
            {n}
          </button>
        ))}
        <button onClick={() => setShares(Math.max(1, Math.min(MAX_QUICK_SHARES, ceiling)))}>
          MAX
        </button>
      </div>

      <dl className="trade-economics">
        <div>
          <dt>{action === 'buy' ? 'ESTIMATED COST' : 'ESTIMATED CREDIT'}</dt>
          <dd>{fmtCents(total)}</dd>
        </div>
        <div>
          <dt>PAYS IF {side === 'yes' ? 'REAL' : 'LARP'}</dt>
          <dd>{fmtCents(payout)}</dd>
        </div>
        <div className="profit-line">
          <dt>POTENTIAL PROFIT</dt>
          <dd>+{fmtCents(Math.max(0, payout - total))}</dd>
        </div>
        <div>
          <dt>AVAILABLE CASH</dt>
          <dd>{fmtCents(cash)}</dd>
        </div>
      </dl>

      {(error || notEnoughCash || notEnoughShares || expired) && (
        <p className="ticket-error">
          {error ??
            (expired
              ? 'This market has closed.'
              : notEnoughCash
                ? 'Not enough cash for this order.'
                : `You only hold ${owned} ${side.toUpperCase()}.`)}
        </p>
      )}

      <button
        className={`submit-trade submit-trade--${side}`}
        disabled={blocked || submitting}
        onClick={submit}
      >
        {submitting
          ? 'WORKING…'
          : `${action.toUpperCase()} ${shares} ${side.toUpperCase()} · ${fmtCents(total)}`}
      </button>
      <p className="ticket-fineprint">
        Settles at $1.00 if correct. Game credits have no cash value.
      </p>
    </aside>
  );
}
