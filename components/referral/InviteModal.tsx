'use client';

import QRCode from 'react-qr-code';
import { useCallback, useEffect, useRef } from 'react';
import type { Player } from '@/lib/types';
import { useReferralLink } from './useReferralLink';

// ---------------------------------------------------------------------------
// The invite. This is the canonical referral surface — reached from the header
// on every screen, so the portfolio card is only a pointer at it.
//
// It leads with the payout because that is the whole pitch. The fine print is
// the one real constraint claim_referral enforces: the referee must be a fresh
// account with no trades and no positions, so the link has to be used BEFORE
// their first trade, not after.
// ---------------------------------------------------------------------------

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export interface InviteModalProps {
  player: Player;
  onClose: () => void;
}

export function InviteModal({ player, onClose }: InviteModalProps) {
  const { link, bonus, canShare, copyLabel, shareLabel, statusMessage, onCopy, onShare } =
    useReferralLink(player);

  const dialog = useRef<HTMLElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  const close = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    opener.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const priorOverflow = document.body.style.overflow;
    const node = dialog.current;
    document.body.style.overflow = 'hidden';
    node?.querySelector<HTMLElement>('[data-autofocus]')?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'Tab' || !node) return;

      const focusable = Array.from(
        node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
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
      opener.current?.focus({ preventScroll: true });
    };
  }, [close]);

  return (
    <div
      className="modal-layer"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <section
        ref={dialog}
        id="invite-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-title"
        className="panel-modal invite-modal"
      >
        <div className="modal-head">
          <div>
            <span>INVITE A CANDIDATE</span>
            <h2 id="invite-title">{bonus} for you. {bonus} for them.</h2>
          </div>
          <button data-autofocus type="button" onClick={close} aria-label="Close invite">
            CLOSE ×
          </button>
        </div>

        <div className="invite-modal__body">
          <div className="invite-split">
            <div>
              <span>YOU GET</span>
              <strong className="tnum">{bonus}</strong>
            </div>
            <div>
              <span>THEY GET</span>
              <strong className="tnum">{bonus}</strong>
            </div>
          </div>

          <div className="invite-modal__code">
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
            {canShare && (
              <button type="button" className="invite-primary" onClick={onShare}>
                {shareLabel}
              </button>
            )}
            <button type="button" onClick={onCopy}>
              {copyLabel}
            </button>
          </div>

          <p className="form-rule">
            Point a phone camera at the code, or send the link. Both balances move the
            moment they join — but they have to use your link before their first trade.
          </p>

          <p className="sr-only" role="status" aria-live="polite">
            {statusMessage}
          </p>
        </div>
      </section>
    </div>
  );
}

export default InviteModal;
