'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { REFERRAL_BONUS, fmtCents, type Player } from '@/lib/types';

// ---------------------------------------------------------------------------
// The growth loop. One link, one big button, both sides get paid.
// ---------------------------------------------------------------------------

/** "$50" when the bonus is whole dollars, else "$50.25". Never hardcoded. */
function bonusLabel(cents: number): string {
  return cents % 100 === 0 ? `$${cents / 100}` : fmtCents(cents);
}

/** Clipboard API needs a secure context — booths often run on plain http. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export interface ReferralCardProps {
  player: Player;
  className?: string;
}

export function ReferralCard({ player, className = '' }: ReferralCardProps) {
  // Resolved after mount so SSR and the first client render agree.
  const [origin, setOrigin] = useState('');
  const [canShare, setCanShare] = useState(false);
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setOrigin(typeof window !== 'undefined' ? window.location.origin : '');
    setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const link = `${origin}/?ref=${player.ref_code}`;
  const bonus = bonusLabel(REFERRAL_BONUS);
  const pitch = `I'm trading fake startups on Overvalued. Use my link and we both get ${bonus}.`;

  const flag = useCallback((ok: boolean) => {
    if (timer.current) clearTimeout(timer.current);
    if (ok) setCopied(true);
    else setFailed(true);
    timer.current = setTimeout(() => {
      setCopied(false);
      setFailed(false);
    }, 2000);
  }, []);

  const onCopy = useCallback(async () => {
    flag(await copyText(link));
  }, [link, flag]);

  const onShare = useCallback(async () => {
    try {
      await navigator.share({ title: 'Overvalued', text: pitch, url: link });
    } catch (err) {
      // User dismissed the sheet — not an error worth surfacing.
      if (err instanceof Error && err.name === 'AbortError') return;
      flag(await copyText(link));
    }
  }, [link, pitch, flag]);

  return (
    <section
      className={`rounded-2xl border border-gold/30 bg-surface p-4 ${className}`}
      aria-label="Referral link"
    >
      <div>
        <h2 className="text-lg font-bold leading-tight text-fg">
          Share this. You both get{' '}
          <span className="tnum text-gold">{bonus}</span>.
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          They join with your link, {bonus} lands in each account. Cash you can put
          straight into a market.
        </p>

        <div className="mt-3 flex items-center gap-2 rounded-lg border border-line bg-ink px-3 py-2.5">
          <code className="tnum min-w-0 flex-1 truncate font-mono text-xs text-muted">
            {origin ? link : `/?ref=${player.ref_code}`}
          </code>
          <span className="tnum shrink-0 rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] font-bold uppercase tracking-wider text-gold">
            {player.ref_code}
          </span>
        </div>

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onCopy}
            aria-live="polite"
            className={`min-h-12 flex-1 rounded-xl px-4 text-sm font-bold transition active:scale-[0.98] ${
              copied
                ? 'bg-yes text-ink'
                : failed
                  ? 'bg-no text-ink'
                  : 'bg-gold text-ink'
            }`}
          >
            {copied ? 'Copied ✓' : failed ? 'Copy failed — select it' : 'Copy link'}
          </button>

          {canShare && (
            <button
              type="button"
              onClick={onShare}
              className="min-h-12 shrink-0 rounded-xl border border-line bg-surface-2 px-4 text-sm font-bold text-fg transition active:scale-[0.98]"
            >
              Share
            </button>
          )}
        </div>

        {!canShare && (
          <p className="mt-2 text-center text-[11px] text-muted">
            Or read them the code: <span className="font-mono text-gold">{player.ref_code}</span>
          </p>
        )}
      </div>
    </section>
  );
}

export default ReferralCard;
