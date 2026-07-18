'use client';

// ============================================================================
// The author declares, about their OWN résumé, whether it is REAL or a LARP.
// This is the hidden truth the market resolves against, so two things have to
// land instantly: (1) nobody sees this until the reference check, and
// (2) LARP is the fun button.
// ============================================================================

export interface RealLarpToggleProps {
  /** true = REAL, false = LARP, null = not chosen yet. */
  value: boolean | null;
  onChange: (isReal: boolean) => void;
  disabled?: boolean;
  /** Shown under the toggle when the author tries to submit without picking. */
  error?: string | null;
}

export function RealLarpToggle({
  value,
  onChange,
  disabled,
  error,
}: RealLarpToggleProps) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">
          The truth
        </span>
        <span className="text-[11px] text-muted">
          🔒 secret until the reference check
        </span>
      </div>

      <div
        role="radiogroup"
        aria-label="Is your résumé real or a LARP?"
        className="grid grid-cols-2 gap-2"
      >
        <Option
          selected={value === true}
          disabled={disabled}
          onSelect={() => onChange(true)}
          tone="yes"
          label="ALL REAL"
          sub="every line is true"
        />
        <Option
          selected={value === false}
          disabled={disabled}
          onSelect={() => onChange(false)}
          tone="no"
          label="TOTAL LARP"
          sub="I made this up"
          badge="the fun one"
        />
      </div>

      <p className="mt-2 text-[11px] leading-snug text-muted">
        {value === null
          ? 'Pick one. The room bets on which it is — they never see your answer until time runs out.'
          : value
            ? 'You are claiming this is your actual résumé. YES pays out when the room believes you.'
            : 'Beautiful. Sell it with a straight face. NO pays out — and everyone who bought YES funds it.'}
      </p>

      {error ? (
        <p className="mt-1.5 text-xs font-medium text-no" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Option({
  selected,
  disabled,
  onSelect,
  tone,
  label,
  sub,
  badge,
}: {
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
  tone: 'yes' | 'no';
  label: string;
  sub: string;
  badge?: string;
}) {
  const on =
    tone === 'yes'
      ? 'border-yes bg-yes/15 text-yes'
      : 'border-no bg-no/15 text-no';
  const off =
    'border-line bg-surface-2 text-muted active:border-line/80 hover:border-line/80';

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={[
        'relative min-h-[62px] rounded-xl border-2 px-3 py-2.5 text-left transition-colors',
        'disabled:opacity-50',
        selected ? on : off,
      ].join(' ')}
    >
      <span className="block text-base font-extrabold tracking-tight">
        {label}
      </span>
      <span className="mt-0.5 block text-[11px] leading-tight opacity-80">
        {sub}
      </span>
      {badge && !selected ? (
        <span className="absolute -top-2 right-2 rounded-full bg-gold px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-ink">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

export default RealLarpToggle;
