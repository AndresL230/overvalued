'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  fmtCents,
  fmtCountdown,
  fmtTC,
  msUntil,
  previewBps,
  priceForSide,
  type MarketPublic,
  type Side,
  type TradeAction,
  type TradeResult,
} from '@/lib/types';
import { CostPreview, orderBlockReason } from './CostPreview';
import { FillConfirmation } from './FillConfirmation';
import { ShareStepper } from './ShareStepper';
import { SideToggle } from './SideToggle';

export interface TradeSheetProps {
  market: MarketPublic;
  playerId: string;
  /** player cash in cents */
  cash: number;
  position?: { yes: number; no: number };
  open: boolean;
  onClose: () => void;
  /** fires after a confirmed fill so the owner can refresh cash + positions */
  onFilled?: (r: TradeResult) => void;
}

interface Fill {
  shares: number;
  side: Side;
  action: TradeAction;
  priceCents: number;
  fromBps: number;
  toBps: number;
}

const DRAG_CLOSE_PX = 110;

export function TradeSheet({
  market,
  playerId,
  cash,
  position,
  open,
  onClose,
  onFilled,
}: TradeSheetProps) {
  const [side, setSide] = useState<Side>('yes');
  const [action, setAction] = useState<TradeAction>('buy');
  const [shares, setShares] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fill, setFill] = useState<Fill | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Authoritative-until-the-parent-catches-up values returned by the RPC.
  const [cashOverride, setCashOverride] = useState<number | null>(null);
  const [posOverride, setPosOverride] = useState<{
    yes: number;
    no: number;
  } | null>(null);

  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const [dragY, setDragY] = useState(0);
  const dragStart = useRef<number | null>(null);

  const heldYes = posOverride?.yes ?? position?.yes ?? 0;
  const heldNo = posOverride?.no ?? position?.no ?? 0;
  const held = side === 'yes' ? heldYes : heldNo;
  const hasAnyPosition = heldYes > 0 || heldNo > 0;
  const effCash = cashOverride ?? cash;

  const bps = market.prob_yes_bps;
  const unitPrice = priceForSide(bps, side);
  const msLeft = Math.max(0, new Date(market.expires_at).getTime() - now);
  const locked = market.status !== 'active' || msUntil(market.expires_at) <= 0;

  const maxShares =
    action === 'buy'
      ? unitPrice > 0
        ? Math.floor(effCash / unitPrice)
        : 0
      : held;

  const blocked = orderBlockReason({
    bps,
    side,
    action,
    shares,
    cash: effCash,
    sharesHeld: held,
  });
  const canSubmit = !locked && !blocked && !submitting && !fill && shares > 0;

  // --- parent data wins whenever it changes -------------------------------
  useEffect(() => {
    setCashOverride(null);
  }, [cash]);
  useEffect(() => {
    setPosOverride(null);
  }, [position?.yes, position?.no]);

  // --- open / close choreography ------------------------------------------
  useEffect(() => {
    if (open) {
      setMounted(true);
      const r = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(r);
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), 220);
    return () => clearTimeout(t);
  }, [open]);

  // reset the ticket whenever it opens on a (possibly new) market
  useEffect(() => {
    if (!open) return;
    setSide('yes');
    setAction('buy');
    setShares(1);
    setError(null);
    setFill(null);
    setDragY(0);
    setCashOverride(null);
    setPosOverride(null);
  }, [open, market.id]);

  // live countdown so the lock engages while the sheet sits open
  useEffect(() => {
    if (!open) return;
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, [open]);

  // esc to dismiss + body scroll lock
  useEffect(() => {
    if (!open) return;
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
  }, [open, onClose]);

  // keep the order legal when the inputs around it change
  useEffect(() => {
    setShares((s) => {
      if (maxShares <= 0) return 0;
      return Math.min(Math.max(1, Math.floor(s)), maxShares);
    });
  }, [maxShares]);

  // selling is only offered while something is held
  useEffect(() => {
    if (action === 'sell' && !hasAnyPosition) setAction('buy');
  }, [action, hasAnyPosition]);

  const submit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    const fromBps = bps;
    const sentShares = shares;
    const sentSide = side;
    const sentAction = action;

    try {
      const { data: raw, error: rpcErr } = await supabase.rpc('trade', {
        p_player: playerId,
        p_market: market.id,
        p_side: sentSide,
        p_action: sentAction,
        p_shares: sentShares,
      });

      if (rpcErr) {
        setError(rpcErr.message);
        return;
      }

      const res = raw as unknown as TradeResult;
      if (!res || !res.ok) {
        // Surface the database's wording verbatim — it is already player-facing.
        setError(res?.error ?? 'trade failed');
        return;
      }

      const toBps =
        res.prob_yes_bps ??
        previewBps(fromBps, sentSide, sentAction, sentShares);

      if (typeof res.cash === 'number') setCashOverride(res.cash);
      setPosOverride((p) => {
        const base = p ?? { yes: heldYes, no: heldNo };
        const delta = sentAction === 'buy' ? sentShares : -sentShares;
        return sentSide === 'yes'
          ? { ...base, yes: Math.max(0, base.yes + delta) }
          : { ...base, no: Math.max(0, base.no + delta) };
      });

      setFill({
        shares: res.shares ?? sentShares,
        side: sentSide,
        action: sentAction,
        priceCents: res.price_cents ?? priceForSide(fromBps, sentSide),
        fromBps,
        toBps,
      });
      setShares(1);
      onFilled?.(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'network error');
    } finally {
      setSubmitting(false);
    }
  }, [
    canSubmit,
    bps,
    shares,
    side,
    action,
    playerId,
    market.id,
    heldYes,
    heldNo,
    onFilled,
  ]);

  // --- drag-to-dismiss -----------------------------------------------------
  const onPointerDown = (e: React.PointerEvent) => {
    dragStart.current = e.clientY;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (dragStart.current === null) return;
    setDragY(Math.max(0, e.clientY - dragStart.current));
  };
  const onPointerUp = () => {
    if (dragStart.current === null) return;
    const shouldClose = dragY > DRAG_CLOSE_PX;
    dragStart.current = null;
    setDragY(0);
    if (shouldClose) onClose();
  };

  if (!mounted) return null;

  const urgent = msLeft > 0 && msLeft < 60_000;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`Trade ${market.title}`}
    >
      {/* scrim */}
      <button
        type="button"
        aria-label="Close trade ticket"
        onClick={onClose}
        className={[
          'absolute inset-0 bg-black/75 backdrop-blur-sm transition-opacity duration-200',
          shown ? 'opacity-100' : 'opacity-0',
        ].join(' ')}
      />

      {/* panel */}
      <div
        style={{
          transform: shown
            ? `translateY(${dragY}px)`
            : 'translateY(100%)',
          transition: dragStart.current === null ? 'transform 220ms cubic-bezier(0.22,1,0.36,1)' : 'none',
        }}
        className={[
          'relative flex max-h-[92dvh] w-full flex-col overflow-hidden',
          'rounded-t-3xl border border-line bg-surface shadow-[0_-24px_60px_-12px_rgba(0,0,0,0.9)]',
          'sm:max-w-md sm:rounded-3xl sm:shadow-[0_24px_80px_-12px_rgba(0,0,0,0.95)]',
        ].join(' ')}
      >
        {/* grab handle / header */}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="shrink-0 cursor-grab touch-none border-b border-line px-4 pt-2.5 pb-3 active:cursor-grabbing"
        >
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line sm:hidden" />

          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-[15px] leading-snug font-bold text-fg">
                {market.title}
              </h2>
              <p className="tnum mt-0.5 text-[11px] tracking-[0.1em] text-muted uppercase">
                asking <span className="text-gold">{fmtTC(market.asking_tc)}</span>
                <span className="mx-1.5 opacity-40">·</span>
                <span
                  className={[
                    urgent ? 'text-hot pulse-urgent' : 'text-muted',
                  ].join(' ')}
                >
                  {locked ? 'closed' : fmtCountdown(msLeft)}
                </span>
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mt-1 -mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xl leading-none text-muted transition-colors hover:bg-surface-2 hover:text-fg"
            >
              ×
            </button>
          </div>
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          {fill ? (
            <FillConfirmation
              shares={fill.shares}
              side={fill.side}
              action={fill.action}
              priceCents={fill.priceCents}
              fromBps={fill.fromBps}
              toBps={fill.toBps}
              onDone={() => setFill(null)}
            />
          ) : (
            <div className="flex flex-col gap-4">
              {/* buy / sell — only once the player holds something here */}
              {hasAnyPosition && (
                <div className="flex gap-2 rounded-xl border border-line bg-ink p-1">
                  {(['buy', 'sell'] as const).map((a) => (
                    <button
                      key={a}
                      type="button"
                      disabled={locked}
                      onClick={() => {
                        setAction(a);
                        setError(null);
                      }}
                      className={[
                        'min-h-[40px] flex-1 rounded-lg text-[12px] font-black tracking-[0.16em] uppercase transition-colors',
                        'disabled:cursor-not-allowed disabled:opacity-40',
                        action === a
                          ? 'bg-surface-2 text-fg'
                          : 'text-muted hover:text-fg',
                      ].join(' ')}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              )}

              <SideToggle
                bps={bps}
                value={side}
                onChange={(s) => {
                  setSide(s);
                  setError(null);
                }}
                disabled={locked}
              />

              {hasAnyPosition && (
                <p className="tnum -mt-1 text-center text-[10px] tracking-[0.14em] text-muted uppercase">
                  you hold <span className="text-yes">{heldYes} yes</span>
                  <span className="mx-1.5 opacity-40">·</span>
                  <span className="text-no">{heldNo} no</span>
                </p>
              )}

              <ShareStepper
                value={shares}
                onChange={(n) => {
                  setShares(n);
                  setError(null);
                }}
                max={maxShares}
                unitPriceCents={unitPrice}
                side={side}
                disabled={locked}
              />

              <CostPreview
                bps={bps}
                side={side}
                action={action}
                shares={shares}
                cash={effCash}
                sharesHeld={held}
                locked={locked}
              />

              {error && (
                <p
                  role="alert"
                  key={error}
                  className="shake rounded-lg border border-no/50 bg-no/10 px-3 py-2.5 text-center text-[13px] font-bold text-no"
                >
                  {error}
                </p>
              )}
            </div>
          )}
        </div>

        {/* footer */}
        <div className="shrink-0 border-t border-line bg-surface px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="mb-2.5 flex items-baseline justify-between">
            <span className="text-[10px] tracking-[0.18em] text-muted uppercase">
              Your cash
            </span>
            <span className="tnum text-sm font-black text-gold">
              {fmtCents(effCash)}
            </span>
          </div>

          <button
            type="button"
            disabled={!canSubmit}
            onClick={submit}
            className={[
              'min-h-[58px] w-full rounded-xl text-base font-black tracking-[0.12em] uppercase',
              'transition-all duration-150 active:scale-[0.985]',
              'disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-muted disabled:shadow-none',
              canSubmit && side === 'yes'
                ? 'bg-yes text-ink shadow-[0_0_32px_-8px_var(--color-yes)]'
                : canSubmit
                  ? 'bg-no text-ink shadow-[0_0_32px_-8px_var(--color-no)]'
                  : '',
            ].join(' ')}
          >
            {locked
              ? 'reference check in progress'
              : submitting
                ? 'sending…'
                : fill
                  ? 'filled'
                  : blocked
                    ? blocked
                    : `${action} ${shares} ${side.toUpperCase()} · ${fmtCents(
                        unitPrice * shares,
                      )}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default TradeSheet;
