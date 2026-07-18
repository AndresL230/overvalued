'use client';

import type { Side } from '@/lib/types';

export interface ShareStepperProps {
  value: number;
  onChange: (shares: number) => void;
  /** largest order the player can place right now (affordability or shares held) */
  max: number;
  /** marginal price per share, in cents — used for the per-share caption */
  unitPriceCents: number;
  side: Side;
  disabled?: boolean;
}

const CHIPS = [1, 5, 10, 25] as const;

/** Always returns a whole number inside [1, max] (or 0 when nothing is possible). */
function clampShares(n: number, max: number): number {
  if (!Number.isFinite(n)) return max > 0 ? 1 : 0;
  const whole = Math.floor(n);
  if (max <= 0) return 0;
  return Math.min(max, Math.max(1, whole));
}

export function ShareStepper({
  value,
  onChange,
  max,
  unitPriceCents,
  side,
  disabled,
}: ShareStepperProps) {
  const locked = disabled || max <= 0;
  const set = (n: number) => onChange(clampShares(n, max));

  const tone = side === 'yes' ? 'text-yes' : 'text-no';
  const chipActive =
    side === 'yes'
      ? 'border-yes/60 bg-yes/15 text-yes'
      : 'border-no/60 bg-no/15 text-no';

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] tracking-[0.2em] text-muted uppercase">
          Shares
        </span>
        <span className="tnum text-[10px] tracking-[0.14em] text-muted uppercase">
          max {max}
        </span>
      </div>

      <div className="flex items-stretch gap-2.5">
        <button
          type="button"
          aria-label="Decrease shares"
          disabled={locked || value <= 1}
          onClick={() => set(value - 1)}
          className="h-[56px] w-[56px] shrink-0 rounded-xl border border-line bg-surface-2 text-2xl leading-none font-black text-fg transition-colors active:bg-line disabled:cursor-not-allowed disabled:opacity-30"
        >
          −
        </button>

        <div className="flex min-w-0 flex-1 flex-col items-center justify-center rounded-xl border border-line bg-ink px-2">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            aria-label="Share count"
            disabled={locked}
            value={max <= 0 ? '0' : String(value)}
            onChange={(e) => {
              const digits = e.target.value.replace(/[^0-9]/g, '');
              if (digits === '') return;
              set(Number.parseInt(digits, 10));
            }}
            onBlur={() => set(value)}
            className={[
              'tnum w-full bg-transparent text-center text-[34px] leading-none font-black',
              'outline-none disabled:opacity-40',
              tone,
            ].join(' ')}
          />
          <span className="tnum mt-1 text-[10px] text-muted">
            @ {unitPriceCents}¢ each
          </span>
        </div>

        <button
          type="button"
          aria-label="Increase shares"
          disabled={locked || value >= max}
          onClick={() => set(value + 1)}
          className="h-[56px] w-[56px] shrink-0 rounded-xl border border-line bg-surface-2 text-2xl leading-none font-black text-fg transition-colors active:bg-line disabled:cursor-not-allowed disabled:opacity-30"
        >
          +
        </button>
      </div>

      <div className="flex gap-2">
        {CHIPS.map((n) => (
          <button
            key={n}
            type="button"
            disabled={locked || n > max}
            onClick={() => set(n)}
            className={[
              'tnum min-h-[44px] flex-1 rounded-lg border text-sm font-bold transition-colors',
              'disabled:cursor-not-allowed disabled:opacity-25',
              value === n
                ? chipActive
                : 'border-line bg-surface-2 text-muted hover:text-fg',
            ].join(' ')}
          >
            {n}
          </button>
        ))}
        <button
          type="button"
          disabled={locked}
          onClick={() => set(max)}
          className={[
            'min-h-[44px] flex-1 rounded-lg border text-sm font-black tracking-[0.1em] transition-colors',
            'disabled:cursor-not-allowed disabled:opacity-25',
            value === max && max > 0
              ? chipActive
              : 'border-gold/40 bg-gold/10 text-gold hover:bg-gold/20',
          ].join(' ')}
        >
          MAX
        </button>
      </div>
    </div>
  );
}

export default ShareStepper;
