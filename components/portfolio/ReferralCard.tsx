'use client';

import QRCode from 'react-qr-code';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { REFERRAL_BONUS, fmtCents, type Player } from '@/lib/types';

// ---------------------------------------------------------------------------
// The growth loop. The server owns eligibility and payout; this component only
// turns an existing referral code into a link people can copy, share, or scan.
// ---------------------------------------------------------------------------

type ActionStatus = 'idle' | 'copied' | 'shared' | 'failed';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

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

// Client-only values read through useSyncExternalStore: the server snapshot
// keeps hydration honest, then the real value lands on the client.
const noSubscribe = () => () => {};
const getOrigin = () => window.location.origin;
const serverOrigin = () => '';
const getCanShare = () => typeof navigator.share === 'function';
const serverCanShare = () => false;

export interface ReferralCardProps {
  player: Player;
  className?: string;
}

export function ReferralCard({ player, className = '' }: ReferralCardProps) {
  const origin = useSyncExternalStore(noSubscribe, getOrigin, serverOrigin);
  const canShare = useSyncExternalStore(noSubscribe, getCanShare, serverCanShare);
  const [status, setStatus] = useState<ActionStatus>('idle');
  const [qrOpen, setQrOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const qrTrigger = useRef<HTMLButtonElement>(null);
  const qrDialog = useRef<HTMLElement>(null);

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

  const closeQr = useCallback(() => setQrOpen(false), []);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  useEffect(() => {
    if (!qrOpen) return;

    const priorOverflow = document.body.style.overflow;
    const dialog = qrDialog.current;
    const returnFocus = qrTrigger.current;
    document.body.style.overflow = 'hidden';
    dialog?.querySelector<HTMLElement>('[data-autofocus]')?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeQr();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((element) => element.getAttribute('aria-hidden') !== 'true');
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = priorOverflow;
      returnFocus?.focus();
    };
  }, [closeQr, qrOpen]);

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

  const copyLabel =
    status === 'copied'
      ? 'Copied ✓'
      : status === 'failed'
        ? 'Try again'
        : 'Copy';
  const primaryLabel = canShare
    ? status === 'shared'
      ? 'Shared ✓'
      : 'Share invite'
    : status === 'copied'
      ? 'Copied ✓'
      : status === 'failed'
        ? 'Copy failed'
        : 'Copy invite';
  const statusMessage =
    status === 'copied'
      ? 'Referral link copied.'
      : status === 'shared'
        ? 'Referral invite shared.'
        : status === 'failed'
          ? 'Could not copy the referral link. Please try again.'
          : '';

  return (
    <>
      <section
        className={`relative overflow-hidden rounded-2xl border border-gold/30 bg-surface p-4 ${className}`}
        aria-labelledby="referral-title"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold to-transparent"
        />

        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-gold">
            Referral credit
          </span>
          <span className="tnum rounded-full border border-gold/25 bg-gold/10 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-gold">
            {bonus} each
          </span>
        </div>

        <h2 id="referral-title" className="mt-3 text-xl font-black leading-tight tracking-tight text-fg">
          Bring a trader. Split the upside.
        </h2>
        <p className="mt-1.5 max-w-md text-xs leading-relaxed text-muted">
          They open your invite, and both accounts get {bonus} in game credit —
          enough to move a market immediately.
        </p>

        <div className="mt-4 flex items-center gap-2 rounded-xl border border-line bg-ink p-1.5 pl-3">
          <div className="min-w-0 flex-1">
            <span className="block font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-muted">
              Your invite
            </span>
            <code className="tnum mt-0.5 block truncate font-mono text-xs text-fg">
              {link}
            </code>
          </div>
          <button
            type="button"
            onClick={onCopy}
            className={`min-h-10 shrink-0 rounded-lg px-3 font-mono text-[11px] font-black uppercase tracking-wider transition active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${
              status === 'copied'
                ? 'bg-yes text-ink'
                : status === 'failed'
                  ? 'bg-no text-ink'
                  : 'bg-surface-2 text-gold hover:bg-line'
            }`}
          >
            {copyLabel}
          </button>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={canShare ? onShare : onCopy}
            className={`min-h-12 rounded-xl px-4 text-sm font-black transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${
              status === 'failed'
                ? 'bg-no text-ink'
                : status === 'copied' || status === 'shared'
                  ? 'bg-yes text-ink'
                  : 'bg-gold text-ink hover:bg-[#ffd66d]'
            }`}
          >
            {primaryLabel}
          </button>
          <button
            ref={qrTrigger}
            type="button"
            onClick={() => setQrOpen(true)}
            aria-haspopup="dialog"
            aria-controls="referral-qr-dialog"
            className="min-h-12 rounded-xl border border-line bg-surface-2 px-4 text-sm font-black text-fg transition hover:border-muted active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
          >
            Show QR
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3 text-[10px] leading-relaxed text-muted">
          <span>One reward per new trader.</span>
          <span className="tnum shrink-0 font-mono uppercase tracking-wider text-gold">
            Code {player.ref_code}
          </span>
        </div>
        <p className="sr-only" role="status" aria-live="polite">
          {statusMessage}
        </p>
      </section>

      {qrOpen && (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/80 backdrop-blur-sm sm:items-center sm:p-6"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeQr();
          }}
        >
          <section
            ref={qrDialog}
            id="referral-qr-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="referral-qr-title"
            aria-describedby="referral-qr-description"
            className="max-h-[calc(100dvh-16px)] w-full max-w-md overflow-y-auto rounded-t-3xl border border-line bg-surface shadow-2xl shadow-black/60 sm:rounded-3xl"
          >
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line sm:hidden" aria-hidden />
            <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
              <div>
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-gold">
                  Scan to join
                </span>
                <h2 id="referral-qr-title" className="mt-1 text-xl font-black tracking-tight text-fg">
                  Put {bonus} on both books.
                </h2>
              </div>
              <button
                data-autofocus
                type="button"
                onClick={closeQr}
                className="min-h-10 shrink-0 rounded-lg border border-line bg-surface-2 px-3 font-mono text-[10px] font-bold uppercase tracking-wider text-muted transition hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
                aria-label="Close referral QR code"
              >
                Close ×
              </button>
            </div>

            <div className="px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-5">
              <p id="referral-qr-description" className="mx-auto max-w-xs text-center text-sm leading-relaxed text-muted">
                Point a phone camera here. The invite opens Overvalued with your
                referral code already attached.
              </p>

              <div className="mx-auto mt-5 w-full max-w-[292px] rounded-[22px] border-4 border-gold bg-[#f7f5ed] p-5 shadow-[0_0_0_1px_rgba(255,201,77,0.35),0_18px_60px_rgba(0,0,0,0.45)]">
                <QRCode
                  value={link}
                  size={256}
                  level="M"
                  bgColor="#f7f5ed"
                  fgColor="#05060a"
                  title={`Referral QR code for ${player.ref_code}`}
                  viewBox="0 0 256 256"
                  style={{ display: 'block', height: 'auto', width: '100%' }}
                />
              </div>

              <div className="mt-4 text-center">
                <div className="tnum inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/10 px-3 py-1.5 font-mono text-xs font-black uppercase tracking-[0.14em] text-gold">
                  {player.ref_code}
                </div>
                <p className="mt-2 text-xs text-muted">
                  {bonus} for them <span aria-hidden>·</span> {bonus} for you
                </p>
              </div>

              <div className="mt-5 rounded-xl border border-line bg-ink px-3 py-2.5">
                <code className="tnum block truncate text-center font-mono text-[11px] text-muted">
                  {link}
                </code>
              </div>

              <div className={`mt-3 grid gap-2 ${canShare ? 'grid-cols-2' : 'grid-cols-1'}`}>
                <button
                  type="button"
                  onClick={onCopy}
                  className={`min-h-12 rounded-xl px-4 text-sm font-black transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${
                    status === 'copied'
                      ? 'bg-yes text-ink'
                      : status === 'failed'
                        ? 'bg-no text-ink'
                        : 'bg-gold text-ink hover:bg-[#ffd66d]'
                  }`}
                >
                  {status === 'copied' ? 'Link copied ✓' : status === 'failed' ? 'Try copy again' : 'Copy link'}
                </button>
                {canShare && (
                  <button
                    type="button"
                    onClick={onShare}
                    className="min-h-12 rounded-xl border border-line bg-surface-2 px-4 text-sm font-black text-fg transition hover:border-muted active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
                  >
                    {status === 'shared' ? 'Shared ✓' : 'Share instead'}
                  </button>
                )}
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

export default ReferralCard;
