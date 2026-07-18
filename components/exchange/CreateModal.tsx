'use client';

// ============================================================================
// EXCHANGE lane — "List yourself", in exchange chrome.
//
// Ported from codex/clean-trade-modal's create modal: form on the left, a live
// market preview on the right that shows the listing as the room will first
// see it (50¢ / 50¢, nothing traded yet).
//
// This is a sibling of components/create/CreateSheet.tsx rather than a rewrite
// of it — that file carries the booth sheet plus in-flight upload work, and
// clobbering it to change a layout would be a poor trade.
//
// The résumé upload IS surfaced here. lib/resume-card and /api/resume have
// supported a File seed all along; only the markup was missing.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { fmtTC } from '@/lib/types';
import {
  ACCEPTED_UPLOAD,
  generateResumeCard,
  type ResumeCard,
} from '@/lib/resume-card';
import { parseAskingTc } from '@/components/create/wordlists';
import { ProbabilityRail } from './ProbabilityChart';

const MAX_BULLETS = 5;
const START_ROWS = 3;

interface Errors {
  title?: string;
  bullets?: string;
  tc?: string;
  truth?: string;
  form?: string;
}

export function CreateModal({
  playerId,
  onClose,
  onCreated,
}: {
  playerId: string;
  onClose: () => void;
  onCreated: (marketId: string) => void | Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [bullets, setBullets] = useState<string[]>(() =>
    Array<string>(START_ROWS).fill(''),
  );
  const [tcRaw, setTcRaw] = useState('350000');
  const [isReal, setIsReal] = useState<boolean | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [shake, setShake] = useState(0);

  // Card extras from the résumé desk. Cosmetic — a hand-typed résumé has none.
  const [ticker, setTicker] = useState('');
  const [tagline, setTagline] = useState('');
  const [offline, setOffline] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [busyUpload, setBusyUpload] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    openerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => closeRef.current?.focus({ preventScroll: true }));
    return () => {
      cancelAnimationFrame(frame);
      openerRef.current?.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, submitting]);

  const askingTc = useMemo(() => parseAskingTc(tcRaw), [tcRaw]);

  const applyCard = useCallback((card: ResumeCard) => {
    setTitle(card.title);
    setBullets(() => {
      const next = card.bullets.slice(0, MAX_BULLETS);
      while (next.length < START_ROWS) next.push('');
      return next;
    });
    setTcRaw(String(card.asking_tc));
    setTicker(card.ticker);
    setTagline(card.tagline);
    setOffline(card.offline);
    setErrors({});
    setUploadError(
      card.rejected === 'unsupported_file_type'
        ? "Can't read that one — export it as a PDF and try again."
        : card.rejected === 'file_too_large'
          ? 'That file is over 8MB. Try a smaller PDF.'
          : null,
    );
  }, []);

  /** Invented roll. generateResumeCard never rejects — it degrades to the
   *  local wordlists — so the dice always lands. */
  const rollFromDesk = useCallback(async () => {
    setRolling(true);
    try {
      const card = await generateResumeCard();
      applyCard(card);
      // A rolled résumé is, by definition, not yours — LARP is the honest
      // default. The author can still override it.
      setIsReal((cur) => (cur === null ? false : cur));
    } finally {
      setRolling(false);
    }
  }, [applyCard]);

  /**
   * Crank: escalate what is already on screen rather than rolling fresh.
   *
   * Seeded from the current form, so it builds on the author's own words —
   * including anything they typed by hand or got back from an upload.
   *
   * Offered whatever the settlement truth is set to, on purpose. Gating it
   * behind LARP would turn the card's register into a tell for `is_real`, and
   * the room is supposed to price that, not read it. See the note in
   * app/api/resume/route.ts.
   */
  const crankItUp = useCallback(async () => {
    const current = [
      title.trim(),
      ...bullets.map((b) => b.trim()).filter(Boolean),
      askingTc ? `asking ${askingTc}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    setRolling(true);
    try {
      // Nothing typed yet means there is nothing to escalate — fall through to
      // an invented card so the button never simply does nothing.
      applyCard(await generateResumeCard(current || undefined, { crank: true }));
    } finally {
      setRolling(false);
    }
  }, [title, bullets, askingTc, applyCard]);

  /** Upload path: parody the author's actual résumé rather than inventing one. */
  const rollFromFile = useCallback(
    async (file: File) => {
      setBusyUpload(true);
      try {
        const card = await generateResumeCard(file);
        applyCard(card);
        // An uploaded résumé IS yours, so don't presume it's a LARP the way a
        // fully invented roll does — let the author declare the truth.
        if (!card.offline) setIsReal(null);
      } finally {
        setBusyUpload(false);
      }
    },
    [applyCard],
  );

  const cleanBullets = useMemo(
    () => bullets.map((b) => b.trim()).filter(Boolean).slice(0, MAX_BULLETS),
    [bullets],
  );

  const busy = submitting || rolling || busyUpload;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;

    const t = title.trim();
    const next: Errors = {};
    if (!t) next.title = 'Give yourself a title. Any title.';
    if (cleanBullets.length < 1) next.bullets = 'One bullet minimum. Sell it.';
    if (askingTc === null || !Number.isInteger(askingTc) || askingTc <= 0) {
      next.tc = 'A number. "450k" and "450,000" both work.';
    }
    if (isReal === null) next.truth = 'Pick REAL or LARP — the market needs an answer.';

    if (Object.keys(next).length > 0) {
      setErrors(next);
      setShake((n) => n + 1);
      return;
    }

    setSubmitting(true);
    setErrors({});
    const { data, error } = await supabase.rpc('create_market', {
      p_player: playerId,
      p_title: t,
      p_bullets: cleanBullets,
      p_asking_tc: askingTc as number,
      p_is_real: isReal as boolean,
      p_ticker: ticker || null,
      p_tagline: tagline || null,
    });

    if (error || !data) {
      setSubmitting(false);
      setErrors({ form: error?.message ?? 'Could not list it. Try again.' });
      setShake((n) => n + 1);
      return;
    }

    await onCreated(data as string);
    onClose();
  }

  return (
    <div
      className="modal-layer"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <section
        key={shake}
        className={`create-modal ${
          errors.form || errors.title || errors.bullets || errors.tc || errors.truth
            ? 'shake'
            : ''
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-title"
      >
        <div className="modal-head">
          <div>
            <span>NEW LISTING</span>
            <h2 id="create-title">List your résumé</h2>
          </div>
          <button ref={closeRef} onClick={onClose} disabled={submitting}>
            CLOSE ×
          </button>
        </div>

        <div className="create-grid">
          <form onSubmit={submit}>
            <p className="form-intro">
              Open a 15-minute market on your own résumé. Your settlement choice stays
              sealed until close. House rule: only roast yourself.
            </p>

            <label className="field">
              <span>HEADLINE</span>
              <textarea
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, 90))}
                placeholder="Chief Vibes Officer who…"
              />
            </label>
            {errors.title && <p className="ticket-error">{errors.title}</p>}

            <div className="claims-field">
              <span>RÉSUMÉ CLAIMS</span>
              {bullets.map((claim, i) => (
                <label key={i}>
                  <span>{String(i + 1).padStart(2, '0')}</span>
                  <input
                    aria-label={`Résumé claim ${i + 1}`}
                    value={claim}
                    onChange={(e) =>
                      setBullets((cur) =>
                        cur.map((item, j) => (j === i ? e.target.value : item)),
                      )
                    }
                    placeholder="One suspiciously impressive bullet"
                  />
                </label>
              ))}
              {bullets.length < MAX_BULLETS && (
                <button
                  type="button"
                  className="randomize-button"
                  onClick={() => setBullets((c) => [...c, ''])}
                >
                  + ADD A LINE
                </button>
              )}
            </div>
            {errors.bullets && <p className="ticket-error">{errors.bullets}</p>}

            <label className="field field--short">
              <span>ASKING TC</span>
              <input
                value={tcRaw}
                onChange={(e) => setTcRaw(e.target.value)}
                placeholder="450k"
              />
            </label>
            {errors.tc && <p className="ticket-error">{errors.tc}</p>}

            <div className="truth-field" role="group" aria-label="Settlement truth">
              <div>
                <span>SETTLEMENT TRUTH</span>
                <small>HIDDEN UNTIL THIS MARKET RESOLVES</small>
              </div>
              <div>
                <button
                  type="button"
                  aria-pressed={isReal === true}
                  className={isReal === true ? 'active' : ''}
                  onClick={() => setIsReal(true)}
                >
                  REAL
                </button>
                <button
                  type="button"
                  aria-pressed={isReal === false}
                  className={isReal === false ? 'active' : ''}
                  onClick={() => setIsReal(false)}
                >
                  LARP
                </button>
              </div>
            </div>
            {errors.truth && <p className="ticket-error">{errors.truth}</p>}

            <div className="form-actions">
              <button
                type="button"
                className="randomize-button"
                onClick={() => void rollFromDesk()}
                disabled={busy}
              >
                {rolling ? '🎲 ROLLING…' : '🎲 ROLL A RÉSUMÉ'}
              </button>
              {/* The upload lives behind the label so the control keeps the
                  exchange button styling rather than the OS file widget. */}
              <label className="randomize-button" aria-disabled={busy}>
                {busyUpload ? '⇪ READING…' : '⇪ UPLOAD YOURS'}
                <input
                  type="file"
                  accept={ACCEPTED_UPLOAD}
                  className="sr-only"
                  disabled={busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void rollFromFile(f);
                    e.target.value = '';
                  }}
                />
              </label>
              <button
                type="button"
                className="randomize-button crank-button"
                onClick={() => void crankItUp()}
                disabled={busy}
                title="Escalate what's on screen — available whatever the truth is set to"
              >
                ⇗ CRANK IT UP
              </button>
              <button type="submit" className="open-market-button" disabled={busy}>
                {submitting ? 'OPENING…' : 'OPEN MARKET · 15:00'}
              </button>
            </div>

            {offline && (
              <p className="form-rule">résumé desk offline — rolled from the local wordlists</p>
            )}
            {uploadError && <p className="ticket-error">{uploadError}</p>}
            {errors.form && <p className="ticket-error">{errors.form}</p>}
            <p className="form-rule">
              Only list your own résumé. The joke is on the genre, not the person.
            </p>
          </form>

          <div className="listing-preview">
            <span className="preview-label">LIVE MARKET PREVIEW</span>
            <div className="preview-card">
              <div>
                <span>{ticker ? `${ticker} · REFERENCE CHECK` : 'OV-NEW · REFERENCE CHECK'}</span>
                <span>15:00</span>
              </div>
              <h3>{title || 'Your suspiciously impressive headline appears here'}</h3>
              <p>
                ASKING TC <strong>{askingTc ? fmtTC(askingTc) : '$350K'}</strong>
              </p>
              {tagline && <p>{tagline}</p>}
              <strong className="preview-odds">
                50<sup>%</sup>
              </strong>
              <ProbabilityRail probability={50} />
              <div className="preview-buttons">
                <span>YES 50¢</span>
                <span>NO 50¢</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
