'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { fmtTC } from '@/lib/types';
import { generateResumeCard, type ResumeCard } from '@/lib/resume-card';
import { RandomizeButton } from './RandomizeButton';
import { RealLarpToggle } from './RealLarpToggle';
import { parseAskingTc, type Resume } from './wordlists';

// ============================================================================
// LIST YOURSELF — the whole flow, one screen, no wizard.
// Budget: ~10 seconds from open to on-the-board. Every extra tap loses a
// booth visitor, so the 🎲 path fills all four fields at once and the only
// remaining action is LIST IT.
//
// HOUSE RULE, stated in the UI: you only ever list your OWN résumé.
// ============================================================================

const MAX_BULLETS = 5;
const START_ROWS = 3;
const TITLE_MAX = 90;
const BULLET_MAX = 120;

export interface CreateSheetProps {
  playerId: string;
  open: boolean;
  onClose: () => void;
  onCreated?: (marketId: string) => void;
}

interface Errors {
  title?: string;
  bullets?: string;
  tc?: string;
  truth?: string;
  form?: string;
}

const emptyRows = () => Array.from({ length: START_ROWS }, () => '');

/**
 * Thin shell. Unmounting the form while closed is what gives every visitor a
 * blank sheet — no reset logic, no stale state from the last person in line.
 */
export function CreateSheet({ open, ...rest }: CreateSheetProps) {
  if (!open) return null;
  return <CreateSheetForm {...rest} />;
}

function CreateSheetForm({
  playerId,
  onClose,
  onCreated,
}: Omit<CreateSheetProps, 'open'>) {
  const [title, setTitle] = useState('');
  const [bullets, setBullets] = useState<string[]>(emptyRows);
  const [tcRaw, setTcRaw] = useState('');
  const [isReal, setIsReal] = useState<boolean | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [shake, setShake] = useState(0);
  // Card extras from the résumé desk. Cosmetic — a hand-typed résumé has none.
  const [ticker, setTicker] = useState('');
  const [tagline, setTagline] = useState('');
  const [offline, setOffline] = useState(false);
  // --- Résumé upload wiring -------------------------------------------------
  // Handlers only; no markup. To surface this in the redesigned sheet, render
  // a file input and call rollFromFile(file):
  //
  //   import { ACCEPTED_UPLOAD } from '@/lib/resume-card';
  //   <input type="file" accept={ACCEPTED_UPLOAD}
  //          onChange={e => { const f = e.target.files?.[0];
  //                           if (f) void rollFromFile(f); e.target.value = ''; }} />
  //
  // `busyUpload` drives the pending state, `uploadError` carries a
  // player-readable message for a rejected file (wrong type / too big).
  const [busyUpload, setBusyUpload] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    openerRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const frame = requestAnimationFrame(() => {
      closeButtonRef.current?.focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(frame);
      openerRef.current?.focus({ preventScroll: true });
    };
  }, []);

  // Escape to close, and lock the page behind the sheet.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const askingTc = useMemo(() => parseAskingTc(tcRaw), [tcRaw]);

  const applyRoll = useCallback((r: Resume) => {
    setTitle(r.title);
    setBullets(() => {
      const next = r.bullets.slice(0, MAX_BULLETS);
      while (next.length < START_ROWS) next.push('');
      return next;
    });
    setTcRaw(String(r.askingTc));
    // A rolled résumé is, by definition, not yours — so LARP is the honest
    // default. Saves the only tap left on the fast path. Author can override.
    setIsReal((cur) => (cur === null ? false : cur));
    setErrors({});
  }, []);

  // Model-backed roll. generateResumeCard never rejects — it degrades to the
  // local wordlists — so the dice always lands.
  const applyCard = useCallback(
    (card: ResumeCard) => {
      applyRoll({
        title: card.title,
        bullets: card.bullets,
        askingTc: card.asking_tc,
      });
      setTicker(card.ticker);
      setTagline(card.tagline);
      setOffline(card.offline);
      setUploadError(
        card.rejected === 'unsupported_file_type'
          ? "Can't read that one — export it as a PDF and try again."
          : card.rejected === 'file_too_large'
            ? 'That file is over 8MB. Try a smaller PDF.'
            : null,
      );
    },
    [applyRoll],
  );

  const rollFromDesk = useCallback(async () => {
    applyCard(await generateResumeCard());
  }, [applyCard]);

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

  const setBulletAt = useCallback((i: number, v: string) => {
    setBullets((cur) => cur.map((b, j) => (j === i ? v : b)));
  }, []);

  const removeBulletAt = useCallback((i: number) => {
    setBullets((cur) =>
      cur.length <= 1 ? [''] : cur.filter((_, j) => j !== i),
    );
  }, []);

  const cleanBullets = useMemo(
    () => bullets.map((b) => b.trim()).filter(Boolean).slice(0, MAX_BULLETS),
    [bullets],
  );

  async function submit() {
    if (submitting) return;

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

    onCreated?.(data as string);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-black/78"
        onClick={submitting ? undefined : onClose}
        aria-hidden
      />

      <div
        key={shake}
        role="dialog"
        aria-modal="true"
        aria-label="List your own résumé"
        className={[
          'relative flex max-h-[92dvh] w-full flex-col overflow-hidden',
          'rounded-t-[24px] border-t border-line bg-surface',
          'sm:max-w-lg sm:rounded-[24px] sm:border',
          errors.form || errors.title || errors.bullets || errors.tc || errors.truth
            ? 'shake'
            : '',
        ].join(' ')}
      >
        {/* header */}
        <div className="flex items-start justify-between gap-3 border-b border-line px-4 pb-3 pt-4">
          <div>
            <h2 className="text-xl font-extrabold tracking-tight text-fg">
              List yourself
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              House rule: <span className="text-gold">only roast yourself.</span>{' '}
              This is your résumé, nobody else&apos;s.
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
            className="-mr-1 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-xl leading-none text-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        {/* body */}
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <RandomizeButton onRollAsync={rollFromDesk} disabled={submitting} />
          {offline && (
            <p className="mt-1 text-center text-[11px] text-muted">
              résumé desk offline — rolled from the local wordlists
            </p>
          )}

          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-line" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted">
              or write it yourself
            </span>
            <span className="h-px flex-1 bg-line" />
          </div>

          {/* title */}
          <Field
            label="Your title"
            hint={`${title.trim().length}/${TITLE_MAX}`}
            error={errors.title}
          >
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, TITLE_MAX))}
              placeholder="Chief Vibes Architect"
              autoComplete="off"
              enterKeyHint="next"
              disabled={submitting}
              className="w-full rounded-xl border border-line bg-surface-2 px-3.5 py-3 text-base font-bold text-fg outline-none placeholder:font-normal placeholder:text-muted/60 focus:border-gold disabled:opacity-50"
            />
          </Field>

          {/* bullets */}
          <Field
            label="Your résumé"
            hint={`${cleanBullets.length}/${MAX_BULLETS}`}
            error={errors.bullets}
          >
            <div className="space-y-2">
              {bullets.map((b, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="shrink-0 text-sm text-muted">▸</span>
                  <input
                    value={b}
                    onChange={(e) =>
                      setBulletAt(i, e.target.value.slice(0, BULLET_MAX))
                    }
                    placeholder={
                      i === 0
                        ? 'Cut p99 latency 380ms → 42ms'
                        : i === 1
                          ? 'Scaled a Discord to 90k members (85k bots)'
                          : 'One more line…'
                    }
                    autoComplete="off"
                    disabled={submitting}
                    className="w-full min-w-0 rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-base text-fg outline-none placeholder:text-muted/50 focus:border-gold disabled:opacity-50"
                  />
                  {bullets.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => removeBulletAt(i)}
                      disabled={submitting}
                      aria-label={`Remove bullet ${i + 1}`}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-sm text-muted transition-colors hover:bg-surface-2 hover:text-no disabled:opacity-50"
                    >
                      ✕
                    </button>
                  ) : null}
                </div>
              ))}
              {bullets.length < MAX_BULLETS ? (
                <button
                  type="button"
                  onClick={() => setBullets((c) => [...c, ''])}
                  disabled={submitting}
                  className="inline-flex min-h-11 items-center text-xs font-semibold text-muted transition-colors hover:text-gold disabled:opacity-50"
                >
                  + add a line
                </button>
              ) : null}
            </div>
          </Field>

          {/* asking TC */}
          <Field
            label="You're asking for"
            hint={askingTc !== null ? fmtTC(askingTc) : 'total comp, USD'}
            error={errors.tc}
          >
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-base font-bold text-gold">
                $
              </span>
              <input
                value={tcRaw}
                onChange={(e) => setTcRaw(e.target.value)}
                placeholder="450k"
                inputMode="text"
                autoComplete="off"
                enterKeyHint="done"
                disabled={submitting}
                className="tnum w-full rounded-xl border border-line bg-surface-2 py-3 pl-8 pr-3.5 text-base font-bold text-fg outline-none placeholder:font-normal placeholder:text-muted/60 focus:border-gold disabled:opacity-50"
              />
            </div>
          </Field>

          <RealLarpToggle
            value={isReal}
            onChange={setIsReal}
            disabled={submitting}
            error={errors.truth}
          />
        </div>

        {/* footer */}
        <div
          className="border-t border-line bg-surface px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3"
        >
          {errors.form ? (
            <p className="mb-2 text-xs font-medium text-no" role="alert">
              {errors.form}
            </p>
          ) : null}
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="w-full rounded-xl bg-gold px-4 py-4 text-base font-extrabold uppercase tracking-wide text-ink transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            {submitting ? 'Listing…' : 'List it →'}
          </button>
          <p className="mt-2 text-center text-[11px] text-muted">
            Goes live for 15 minutes. The room prices you. Then the reference
            check.
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">
          {label}
        </span>
        {hint ? <span className="tnum text-[11px] text-muted">{hint}</span> : null}
      </div>
      {children}
      {error ? (
        <p className="mt-1.5 text-xs font-medium text-no" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default CreateSheet;
