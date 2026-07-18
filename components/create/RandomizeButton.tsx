'use client';

import { useCallback, useState } from 'react';
import { randomResume, type Flavor, type Resume } from './wordlists';

// ============================================================================
// The 🎲. This is the primary path — most booth visitors tap this once and
// submit. Tapping again rerolls. Never hand the same title back twice in a
// session if the pool can avoid it.
// ============================================================================

/** Session memory, module-scope so it survives the sheet closing and reopening. */
const seenTitles = new Set<string>();
const MAX_REROLL_TRIES = 14;

/** A résumé whose title has not been served yet this session, if one exists. */
export function freshResume(flavor?: Flavor): Resume {
  let best = randomResume(flavor);
  for (let i = 0; i < MAX_REROLL_TRIES && seenTitles.has(best.title); i++) {
    best = randomResume(flavor);
  }
  seenTitles.add(best.title);
  // The pool is large but not infinite; forget the oldest once it saturates so
  // a long booth session never starves.
  if (seenTitles.size > 120) seenTitles.clear();
  return best;
}

export interface RandomizeButtonProps {
  /** Synchronous wordlist roll. Ignored when `onRollAsync` is supplied. */
  onRoll?: (resume: Resume) => void;
  /** Async roll (model-backed). Takes precedence; must never reject. */
  onRollAsync?: () => Promise<void>;
  flavor?: Flavor;
  disabled?: boolean;
  className?: string;
  /** Compact variant for sitting inline next to a field. */
  compact?: boolean;
}

export function RandomizeButton({
  onRoll,
  onRollAsync,
  flavor,
  disabled,
  className,
  compact,
}: RandomizeButtonProps) {
  const [rolls, setRolls] = useState(0);
  const [rolling, setRolling] = useState(false);

  const roll = useCallback(() => {
    setRolls((n) => n + 1);
    // Prefer the async source (the model) when the host supplies one; it
    // resolves to a wordlist card on its own if the model is unavailable.
    if (onRollAsync) {
      setRolling(true);
      void onRollAsync().finally(() => setRolling(false));
      return;
    }
    onRoll?.(freshResume(flavor));
  }, [onRoll, onRollAsync, flavor]);

  if (compact) {
    return (
      <button
        type="button"
        onClick={roll}
        disabled={disabled}
        aria-label="Reroll résumé"
        className={[
          'shrink-0 rounded-lg border border-line bg-surface-2 px-3 py-2 text-lg',
          'transition-transform active:scale-90 disabled:opacity-50',
          className ?? '',
        ].join(' ')}
      >
        <span key={rolls} className="inline-block">
          🎲
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={roll}
      disabled={disabled}
      className={[
        'group relative w-full overflow-hidden rounded-xl border-2 border-gold bg-gold/10',
        'px-4 py-4 text-center transition-transform active:scale-[0.98]',
        'disabled:opacity-50',
        className ?? '',
      ].join(' ')}
    >
      <span className="flex items-center justify-center gap-2.5">
        <span key={rolls} className="text-2xl leading-none">
          {rolling ? '⏳' : '🎲'}
        </span>
        <span className="text-base font-extrabold uppercase tracking-wide text-gold">
          {rolling
            ? 'Consulting the résumé desk…'
            : rolls === 0
              ? 'Roll me a résumé'
              : 'Reroll'}
        </span>
      </span>
      <span className="mt-1 block text-[11px] text-muted">
        {rolls === 0
          ? 'Fills everything. Fastest way onto the board.'
          : `Roll #${rolls + 1} — keep smashing until one is funny`}
      </span>
    </button>
  );
}

export default RandomizeButton;
