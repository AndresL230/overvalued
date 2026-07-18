'use client';

import { priceNoCents, priceYesCents, type Side } from '@/lib/types';

export interface SideToggleProps {
  /** current market probability in basis points */
  bps: number;
  value: Side;
  onChange: (side: Side) => void;
  disabled?: boolean;
}

interface CellProps {
  label: string;
  sub: string;
  price: number;
  active: boolean;
  tone: 'yes' | 'no';
  disabled?: boolean;
  onClick: () => void;
}

function Cell({ label, sub, price, active, tone, disabled, onClick }: CellProps) {
  const activeCls =
    tone === 'yes'
      ? 'bg-yes text-ink border-yes'
      : 'bg-no text-ink border-no';
  const idleCls =
    tone === 'yes'
      ? 'bg-yes/10 text-yes border-yes/30 hover:bg-yes/20 hover:border-yes/50'
      : 'bg-no/10 text-no border-no/30 hover:bg-no/20 hover:border-no/50';

  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      aria-label={`${label} at ${price} cents`}
      disabled={disabled}
      onClick={onClick}
      className={[
        'flex min-h-[68px] flex-1 flex-col items-center justify-center gap-0.5',
        'rounded-lg border-2 px-3 py-2 transition-all duration-150 select-none',
        'active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40',
        active ? activeCls : idleCls,
      ].join(' ')}
    >
      <span className="text-xl leading-none font-black tracking-[0.14em]">
        {label}
      </span>
      <span
        className={[
          'tnum text-[13px] leading-none font-bold',
          active ? 'opacity-80' : 'opacity-70',
        ].join(' ')}
      >
        {price}¢
      </span>
      <span
        className={[
          'text-[9px] leading-none tracking-[0.18em] uppercase',
          active ? 'opacity-60' : 'opacity-45',
        ].join(' ')}
      >
        {sub}
      </span>
    </button>
  );
}

export function SideToggle({ bps, value, onChange, disabled }: SideToggleProps) {
  return (
    <div role="radiogroup" aria-label="Pick a side" className="flex gap-2.5">
      <Cell
        label="YES"
        sub="it's real"
        price={priceYesCents(bps)}
        tone="yes"
        active={value === 'yes'}
        disabled={disabled}
        onClick={() => onChange('yes')}
      />
      <Cell
        label="NO"
        sub="it's a larp"
        price={priceNoCents(bps)}
        tone="no"
        active={value === 'no'}
        disabled={disabled}
        onClick={() => onChange('no')}
      />
    </div>
  );
}

export default SideToggle;
