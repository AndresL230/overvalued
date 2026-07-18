'use client';

import { useEffect, useRef } from 'react';
import { fmtTC, type MarketPublic } from '@/lib/types';

// ---------------------------------------------------------------------------
// The submitted résumé, on exchange chrome: `.resume-modal` is a four-row grid
// (head / meta / canvas / note) already sized and made full-bleed below 820px
// by the stylesheet, so the markup here is only those four children in order.
//
// This renders THE MARKET'S OWN CARD as a one-page document. It previously
// showed one of three stock résumé images picked by a checksum of the market
// uuid — a fixture carried over from the clean-trade-modal prototype, which
// had no real listings behind it. On live data that meant "Chief of Staff to
// the Chief of Staff · $380K" opened a stranger's intern CV, which reads as
// broken and, worse, implies the market is about that person.
//
// Everything below comes from markets_public: title, bullets, asking_tc,
// ticker, tagline. No is_real anywhere — the document must not hint at the
// answer the room is betting on.
// ---------------------------------------------------------------------------

/** Section headings are decorative, but a résumé with none reads as a memo.
 *  Bullets are dealt across these in order so the page has structure. */
const SECTIONS = ['EXPERIENCE', 'SELECTED IMPACT', 'OTHER'] as const;

/** Deal bullets into at most three sections, front-loading the first. */
function dealBullets(bullets: string[]): { heading: string; items: string[] }[] {
  if (bullets.length === 0) return [];
  if (bullets.length <= 2) return [{ heading: SECTIONS[0], items: bullets }];
  const head = bullets.slice(0, Math.ceil(bullets.length / 2));
  const tail = bullets.slice(Math.ceil(bullets.length / 2));
  return [
    { heading: SECTIONS[0], items: head },
    { heading: SECTIONS[1], items: tail },
  ];
}

export interface ResumeViewerProps {
  market: MarketPublic;
  onClose: () => void;
}

export function ResumeViewer({ market, onClose }: ResumeViewerProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  // Bot-seeded markets carry a 4-char ticker prefix and no tagline, so both
  // are treated as optional rather than assumed present.
  const ticker = market.ticker?.trim() || market.id.slice(0, 4).toUpperCase();
  const tagline = market.tagline?.trim() || null;
  // Titles arrive as "Role · asking $380K" and occasionally with newlines from
  // the model. Strip the asking clause — it has its own slot on the page.
  const headline = market.title
    .replace(/\s*[·|-]\s*asking\s+\$?[\d.,kKmM]+\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  const sections = dealBullets(market.bullets.map((b) => b.trim()).filter(Boolean));

  useEffect(() => {
    previousFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusFrame = requestAnimationFrame(() => closeRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
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

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      const returnTarget = previousFocus.current;
      requestAnimationFrame(() => returnTarget?.isConnected && returnTarget.focus());
    };
  }, [onClose]);

  return (
    <div
      className="modal-layer"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        id="resume-viewer"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="resume-viewer-title"
        aria-describedby="resume-viewer-note"
        className="resume-modal"
      >
        <div className="modal-head">
          <div>
            <span>SUBMITTED MATERIAL · {ticker}</span>
            <h2 id="resume-viewer-title">Résumé</h2>
          </div>
          <button ref={closeRef} type="button" onClick={onClose}>
            CLOSE ×
          </button>
        </div>

        <div className="resume-modal__meta">
          <div>
            <span>{headline}</span>
            <small>ONE PAGE · SUBMITTED BY THE CANDIDATE</small>
          </div>
          <span className="resume-ask">{fmtTC(market.asking_tc)}</span>
        </div>

        <div className="resume-viewer-canvas">
          <article className="resume-sheet">
            <header className="resume-sheet__head">
              <h3>{headline}</h3>
              {tagline && <p className="resume-sheet__tagline">{tagline}</p>}
              <dl className="resume-sheet__facts">
                <div>
                  <dt>ASKING</dt>
                  <dd>{fmtTC(market.asking_tc)}</dd>
                </div>
                <div>
                  <dt>TICKER</dt>
                  <dd>{ticker}</dd>
                </div>
                <div>
                  <dt>REFERENCES</dt>
                  <dd>ON REQUEST</dd>
                </div>
              </dl>
            </header>

            {sections.map((section) => (
              <section className="resume-sheet__block" key={section.heading}>
                <h4>{section.heading}</h4>
                <ul>
                  {section.items.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </section>
            ))}

            {sections.length === 0 && (
              <p className="resume-sheet__empty">
                The candidate submitted no supporting lines.
              </p>
            )}
          </article>
        </div>

        <p id="resume-viewer-note" className="resume-sample-note">
          Submitted by the candidate. Whether any of it is true is what the market is
          pricing.
        </p>
      </section>
    </div>
  );
}
