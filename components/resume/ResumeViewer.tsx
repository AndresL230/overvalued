'use client';

import Image from 'next/image';
import { useEffect, useRef } from 'react';
import type { MarketPublic } from '@/lib/types';

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
    <div className="fixed inset-0 z-[60] flex items-stretch justify-center sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Close résumé"
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
      />

      <section
        id="resume-viewer"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="resume-viewer-title"
        aria-describedby="resume-viewer-note"
        className="relative grid h-dvh w-full grid-rows-[auto_auto_minmax(0,1fr)_auto] overflow-hidden bg-surface shadow-[0_24px_90px_rgba(0,0,0,0.85)] sm:h-[92dvh] sm:max-h-[1020px] sm:max-w-4xl sm:rounded-3xl sm:border sm:border-line"
      >
        <header className="flex min-h-16 items-center justify-between gap-4 border-b border-line bg-surface px-4 sm:px-5">
          <div className="min-w-0">
            <p className="truncate text-[10px] font-bold tracking-[0.15em] text-gold uppercase">
              Submitted material · {market.id.slice(0, 8)}
            </p>
            <h2 id="resume-viewer-title" className="mt-1 text-xl leading-none font-black text-fg">
              Résumé
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="flex min-h-11 items-center rounded-xl px-3 text-[11px] font-extrabold tracking-[0.1em] text-muted uppercase transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
          >
            Close ×
          </button>
        </header>

        <div className="flex min-h-14 items-center justify-between gap-3 border-b border-line bg-surface-2 px-4 sm:px-5">
          <div className="min-w-0">
            <p className="text-[11px] font-bold tracking-[0.08em] text-fg uppercase">
              Software engineer · intern
            </p>
            <p className="mt-1 text-[9px] tracking-[0.1em] text-muted uppercase">
              {resume.id} · redacted test sample
            </p>
          </div>
          <a
            href={resume.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-11 shrink-0 items-center rounded-xl border border-line px-3 text-[10px] font-extrabold tracking-[0.1em] text-gold uppercase transition-colors hover:border-gold/50 hover:bg-gold/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
          >
            Source ↗
          </a>
        </div>

        <div className="min-h-0 overflow-y-auto overscroll-contain bg-ink p-3 sm:p-6">
          <Image
            src={resume.assetUrl}
            width={resume.width}
            height={resume.height}
            sizes="(max-width: 640px) calc(100vw - 24px), 760px"
            alt="Redacted software engineering intern résumé test sample"
            className="mx-auto h-auto w-full max-w-[760px] bg-white shadow-[0_18px_60px_rgba(0,0,0,0.55)]"
          />
        </div>

        <p
          id="resume-viewer-note"
          className="border-t border-line bg-surface px-4 py-2.5 text-[9px] leading-relaxed text-muted sm:px-5"
        >
          Test asset from the public resumes.fyi catalogue. It is not the identity of this fictional market.
        </p>
      </section>
    </div>
  );
}

export default ResumeViewer;
