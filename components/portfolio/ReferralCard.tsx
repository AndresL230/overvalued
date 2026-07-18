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

  // Uppercase mono to match every other control on the exchange.
  const copyLabel =
    status === 'copied'
      ? 'COPIED ✓'
      : status === 'failed'
        ? 'TRY AGAIN'
        : 'COPY LINK';
  const primaryLabel =
    status === 'shared'
      ? 'SHARED ✓'
      : status === 'failed'
        ? 'TRY AGAIN'
        : 'SHARE';
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
      <section className={`referral-box ${className}`} aria-labelledby="referral-title">
        <div>
          <span id="referral-title">
            REFERRAL CREDIT · {bonus} EACH
          </span>
          <strong className="tnum">{link}</strong>
        </div>

        <button type="button" onClick={canShare ? onShare : onCopy}>
          {canShare ? primaryLabel : copyLabel}
        </button>
        <button
          ref={qrTrigger}
          type="button"
          onClick={() => setQrOpen(true)}
          aria-haspopup="dialog"
          aria-controls="referral-qr-dialog"
        >
          QR CODE
        </button>

        <p className="sr-only" role="status" aria-live="polite">
          {statusMessage}
        </p>
      </section>

      {qrOpen && (
        <div
          className="modal-layer"
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
            className="panel-modal referral-qr"
          >
            <div className="modal-head">
              <div>
                <span>SCAN TO JOIN</span>
                <h2 id="referral-qr-title">Put {bonus} on both books.</h2>
              </div>
              <button
                data-autofocus
                type="button"
                onClick={closeQr}
                aria-label="Close referral QR code"
              >
                CLOSE ×
              </button>
            </div>

            <div className="referral-qr__body">
              <p id="referral-qr-description" className="empty-activity">
                Point a phone camera here. The invite opens Overvalued with the
                referral code already attached.
              </p>

              <div className="referral-qr__code">
                <QRCode
                  value={link}
                  size={256}
                  level="M"
                  bgColor="#e9e7de"
                  fgColor="#121515"
                  title={`Referral QR code for ${player.ref_code}`}
                  viewBox="0 0 256 256"
                  style={{ display: 'block', height: 'auto', width: '100%' }}
                />
              </div>

              <div className="referral-box">
                <div>
                  <span>CODE {player.ref_code}</span>
                  <strong className="tnum">{link}</strong>
                </div>
                <button type="button" onClick={onCopy}>
                  {copyLabel}
                </button>
                {canShare && (
                  <button type="button" onClick={onShare}>
                    {primaryLabel}
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
