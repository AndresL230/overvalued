'use client';

import Image from 'next/image';
import { useEffect, useRef } from 'react';
import type { MarketPublic } from '@/lib/types';

// ---------------------------------------------------------------------------
// The submitted résumé, on exchange chrome: `.resume-modal` is a four-row grid
// (head / meta / canvas / note) already sized and made full-bleed below 820px
// by the stylesheet, so the markup here is only those four children in order.
// ---------------------------------------------------------------------------

const resumeExamples = [
  {
    id: 'SWE-INT-02',
    assetUrl:
      'https://q1hlr76qehnlfpdb.public.blob.vercel-storage.com/resumes/ec0c179b-7b4d-4acc-a8ab-8d210d5a6a35/r.png',
    sourceUrl: 'https://resumes.fyi/yjyoo',
    width: 1101,
    height: 1425,
  },
  {
    id: 'SWE-INT-03',
    assetUrl:
      'https://q1hlr76qehnlfpdb.public.blob.vercel-storage.com/resumes/120a4d05-313d-4b1b-a56d-ceb02db57745/r.png',
    sourceUrl: 'https://resumes.fyi/asiangoat',
    width: 1224,
    height: 1584,
  },
  {
    id: 'SWE-INT-04',
    assetUrl:
      'https://q1hlr76qehnlfpdb.public.blob.vercel-storage.com/resumes/20d5bd97-60ba-4290-b64b-654fa3739e2a/r.png',
    sourceUrl: 'https://resumes.fyi/bradfordhderby',
    width: 1224,
    height: 1584,
  },
] as const;

function resumeForMarket(marketId: string) {
  const checksum = [...marketId].reduce(
    (sum, character) => sum + character.charCodeAt(0),
    0,
  );
  return resumeExamples[checksum % resumeExamples.length];
}

export interface ResumeViewerProps {
  market: MarketPublic;
  onClose: () => void;
}

export function ResumeViewer({ market, onClose }: ResumeViewerProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const resume = resumeForMarket(market.id);

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
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1) ?? first;
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
      cancelAnimationFrame(focusFrame);
      window.removeEventListener('keydown', onKeyDown);
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
            <span>SUBMITTED MATERIAL · {market.id.slice(0, 8).toUpperCase()}</span>
            <h2 id="resume-viewer-title">Résumé</h2>
          </div>
          <button ref={closeRef} type="button" onClick={onClose}>
            CLOSE ×
          </button>
        </div>

        <div className="resume-modal__meta">
          <div>
            <span>SOFTWARE ENGINEER · INTERN</span>
            <small>{resume.id} · REDACTED TEST SAMPLE</small>
          </div>
          <a href={resume.sourceUrl} target="_blank" rel="noreferrer">
            SOURCE ↗
          </a>
        </div>

        <div className="resume-viewer-canvas">
          <Image
            src={resume.assetUrl}
            width={resume.width}
            height={resume.height}
            sizes="(max-width: 640px) calc(100vw - 24px), 760px"
            alt="Redacted software engineering intern résumé test sample"
          />
        </div>

        <p id="resume-viewer-note" className="resume-sample-note">
          Test asset from the public resumes.fyi catalogue. It is not the identity of
          this fictional market.
        </p>
      </section>
    </div>
  );
}

export default ResumeViewer;
