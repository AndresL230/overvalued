'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { REFERRAL_BONUS, fmtCents, type Player } from '@/lib/types';

// ---------------------------------------------------------------------------
// The growth loop, minus the chrome. The server owns eligibility and payout
// (claim_referral); this hook only turns an existing referral code into a link
// people can copy, share, or scan.
//
// Extracted from ReferralCard so the header invite modal and the portfolio
// pointer share one implementation of the clipboard fallback and status
// timers rather than drifting apart.
// ---------------------------------------------------------------------------

export type ActionStatus = 'idle' | 'copied' | 'shared' | 'failed';

/** "$50" when the bonus is whole dollars, else "$50.25". Never hardcoded. */
export function bonusLabel(cents: number = REFERRAL_BONUS): string {
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

// Client-only values read through useSyncExternalStore: the server snapshot
// keeps hydration honest, then the real value lands on the client.
const noSubscribe = () => () => {};
const getOrigin = () => window.location.origin;
const serverOrigin = () => '';
const getCanShare = () => typeof navigator.share === 'function';
const serverCanShare = () => false;

export interface ReferralLink {
  /** Full invite URL, or a relative one until the client hydrates. */
  link: string;
  /** "$50" — derived from REFERRAL_BONUS, both sides get this. */
  bonus: string;
  /** True when the native share sheet is available. */
  canShare: boolean;
  status: ActionStatus;
  copyLabel: string;
  shareLabel: string;
  /** For an aria-live region; empty when idle. */
  statusMessage: string;
  onCopy: () => Promise<void>;
  onShare: () => Promise<void>;
}

export function useReferralLink(player: Player): ReferralLink {
  const origin = useSyncExternalStore(noSubscribe, getOrigin, serverOrigin);
  const canShare = useSyncExternalStore(noSubscribe, getCanShare, serverCanShare);
  const [status, setStatus] = useState<ActionStatus>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const link = origin
    ? `${origin}/?ref=${player.ref_code}`
    : `/?ref=${player.ref_code}`;
  const bonus = bonusLabel(REFERRAL_BONUS);
  const pitch = `Every résumé is a prediction market on Overvalued. Join with my link and we both get ${bonus} in game credit.`;

  const reportStatus = useCallback((next: ActionStatus) => {
    if (timer.current) clearTimeout(timer.current);
    setStatus(next);
    timer.current = setTimeout(() => setStatus('idle'), 2200);
  }, []);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const onCopy = useCallback(async () => {
    reportStatus((await copyText(link)) ? 'copied' : 'failed');
  }, [link, reportStatus]);

  const onShare = useCallback(async () => {
    try {
      await navigator.share({ title: 'Overvalued', text: pitch, url: link });
      reportStatus('shared');
    } catch (error) {
      // A dismissed share sheet is intentional, not an error state.
      if (error instanceof Error && error.name === 'AbortError') return;
      reportStatus((await copyText(link)) ? 'copied' : 'failed');
    }
  }, [link, pitch, reportStatus]);

  // Uppercase mono to match every other control on the exchange.
  const copyLabel =
    status === 'copied' ? 'COPIED ✓' : status === 'failed' ? 'TRY AGAIN' : 'COPY LINK';
  const shareLabel =
    status === 'shared' ? 'SHARED ✓' : status === 'failed' ? 'TRY AGAIN' : 'SHARE';
  const statusMessage =
    status === 'copied'
      ? 'Referral link copied.'
      : status === 'shared'
        ? 'Referral invite shared.'
        : status === 'failed'
          ? 'Could not copy the referral link. Please try again.'
          : '';

  return {
    link,
    bonus,
    canShare,
    status,
    copyLabel,
    shareLabel,
    statusMessage,
    onCopy,
    onShare,
  };
}
