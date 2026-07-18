'use client';

import { useEffect, useState } from 'react';
import { fmtBps, fmtCents, fmtTC, type MarketPublic } from '@/lib/types';
import { YourResult } from './YourResult';

export interface RevealModalProps {
  /** A resolved market. `is_real` must be non-null (face-up). */
  market: MarketPublic;
  /** This player's position captured BEFORE resolution wiped it. */
  heldBefore?: { yes: number; no: number };
  /** Fired once the reveal has finished playing. */
  onDone: () => void;
  /** Total run time of the sequence. Defaults to 4200ms. */
  durationMs?: number;
  /** How many reveals are still waiting behind this one. */
  queuedBehind?: number;
}

type Phase = 'suspense' | 'impact' | 'verdict';

const T_IMPACT = 1200;
const T_VERDICT = 1560;

/**
 * The payoff moment. Full-screen takeover, played on a projector with a room
 * watching, so it is deliberately theatrical:
 *   1. a beat of suspense — "REFERENCE CHECK…"
 *   2. a violent flash + shake
 *   3. the verdict slams down like a rubber stamp
 */
export function RevealModal({
  market,
  heldBefore,
  onDone,
  durationMs = 4200,
  queuedBehind = 0,
}: RevealModalProps) {
  const [phase, setPhase] = useState<Phase>('suspense');

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase('impact'), T_IMPACT),
      setTimeout(() => setPhase('verdict'), T_VERDICT),
      setTimeout(onDone, durationMs),
    ];
    return () => timers.forEach(clearTimeout);
  }, [onDone, durationMs]);

  // Skip on click / Escape — booth operators get impatient.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') onDone();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDone]);

  const isReal = market.is_real === true;
  const bps = market.prob_yes_bps;

  // Which way did the crowd lean, and did they get it right?
  const crowdSaidReal = bps >= 5000;
  const crowdWrong = crowdSaidReal !== isReal;
  const conviction = Math.abs(bps - 5000); // distance from a coin flip
  const badlyWrong = crowdWrong && conviction >= 1000; // beyond 60/40

  const verdictColor = isReal ? 'text-yes' : 'text-no';
  const verdictBorder = isReal ? 'border-yes/60' : 'border-no/60';
  const verdictGlow = isReal
    ? '0 0 60px color-mix(in srgb, var(--color-yes) 45%, transparent)'
    : '0 0 60px color-mix(in srgb, var(--color-no) 45%, transparent)';

  const showVerdict = phase === 'verdict';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-live="assertive"
      aria-label={`Reveal: ${market.title}`}
      onClick={onDone}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-ink/95 p-4 backdrop-blur-sm"
    >
      <style>{`
        @keyframes ovr-scan {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        @keyframes ovr-blast {
          0%   { opacity: 0.95; }
          100% { opacity: 0; }
        }
        @keyframes ovr-rise {
          0%   { opacity: 0; transform: translateY(10px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .ovr-scan  { animation: ovr-scan 900ms linear infinite; }
        .ovr-blast { animation: ovr-blast 620ms ease-out both; }
        .ovr-rise  { animation: ovr-rise 420ms ease-out both; }
        @media (prefers-reduced-motion: reduce) {
          .ovr-scan, .ovr-blast, .ovr-rise { animation: none !important; }
          .ovr-blast { opacity: 0 !important; }
        }
      `}</style>

      {/* the flash — full-bleed, fires once on impact */}
      {phase !== 'suspense' && (
        <div
          aria-hidden
          className="ovr-blast pointer-events-none fixed inset-0 z-10"
          style={{
            background: isReal ? 'var(--color-yes)' : 'var(--color-no)',
          }}
        />
      )}

      <div
        className={[
          'relative z-20 w-full max-w-2xl rounded-2xl border-2 bg-surface p-6 text-center sm:p-9',
          showVerdict ? verdictBorder : 'border-line',
          phase === 'impact' ? 'shake' : '',
        ].join(' ')}
        style={showVerdict ? { boxShadow: verdictGlow } : undefined}
      >
        {/* ---- the résumé under the microscope ---- */}
        <p className="text-[10px] font-bold tracking-[0.34em] text-muted uppercase">
          Reference check
        </p>
        <h2 className="mt-2 text-xl leading-tight font-black text-balance text-fg sm:text-2xl">
          {market.title}
        </h2>
        <p className="tnum mt-1 text-xs font-bold tracking-[0.18em] text-gold uppercase">
          Asking {fmtTC(market.asking_tc)}
        </p>

        {/* ---- phase 1: suspense ---- */}
        {phase === 'suspense' && (
          <div className="mt-7">
            <div className="relative h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div
                className="ovr-scan absolute inset-y-0 w-1/2 rounded-full"
                style={{
                  background:
                    'linear-gradient(90deg, transparent, var(--color-hot), transparent)',
                }}
              />
            </div>
            <p className="pulse-urgent mt-4 text-sm font-black tracking-[0.3em] text-hot uppercase">
              Checking references…
            </p>
            <p className="mt-8 text-[11px] tracking-[0.2em] text-muted uppercase">
              The market closed at{' '}
              <span className="tnum font-black text-fg">{fmtBps(bps)}</span> YES
            </p>
          </div>
        )}

        {/* ---- phase 3: the verdict ---- */}
        {showVerdict && (
          <div className="mt-6">
            <div
              className="stamp mx-auto inline-block border-4 px-7 py-2"
              style={{
                borderColor: isReal ? 'var(--color-yes)' : 'var(--color-no)',
              }}
            >
              <span
                className={[
                  'block text-5xl leading-none font-black tracking-[0.1em] sm:text-7xl',
                  verdictColor,
                ].join(' ')}
              >
                {isReal ? 'REAL' : 'LARP'}
              </span>
            </div>

            <p className="ovr-rise mt-5 text-xs font-bold tracking-[0.24em] text-muted uppercase">
              {isReal
                ? 'This person exists. YES pays.'
                : 'Fabricated. NO pays.'}
            </p>

            {/* ---- what the crowd landed on ---- */}
            <div className="ovr-rise mt-6 grid grid-cols-3 gap-2 border-y border-line py-4">
              <Stat label="Final odds" value={fmtBps(bps)} tone="text-fg" />
              <Stat
                label="YES paid"
                value={isReal ? fmtCents(100) : fmtCents(0)}
                tone={isReal ? 'text-yes' : 'text-muted'}
              />
              <Stat
                label="NO paid"
                value={!isReal ? fmtCents(100) : fmtCents(0)}
                tone={!isReal ? 'text-no' : 'text-muted'}
              />
            </div>

            {/* ---- the best possible booth outcome ---- */}
            <div className="ovr-rise mt-5">
              {crowdWrong ? (
                <div
                  className={[
                    'rounded-lg border-2 px-4 py-3',
                    badlyWrong
                      ? 'border-hot/70 bg-hot/10'
                      : 'border-line bg-surface-2',
                  ].join(' ')}
                >
                  <p
                    className={[
                      'text-lg font-black tracking-[0.14em] uppercase sm:text-xl',
                      badlyWrong ? 'text-hot' : 'text-fg',
                    ].join(' ')}
                  >
                    The market was wrong
                  </p>
                  <p className="tnum mt-1 text-[11px] tracking-[0.14em] text-muted uppercase">
                    {crowdSaidReal ? (
                      <>
                        The crowd priced this at {fmtBps(bps)} REAL. It was a
                        LARP.
                      </>
                    ) : (
                      <>
                        The crowd priced this at {fmtBps(10000 - bps)} LARP. This
                        person is real.
                      </>
                    )}
                  </p>
                </div>
              ) : (
                <p className="tnum text-[11px] tracking-[0.16em] text-muted uppercase">
                  The crowd called it —{' '}
                  <span className={`font-black ${verdictColor}`}>
                    {fmtBps(crowdSaidReal ? bps : 10000 - bps)}{' '}
                    {crowdSaidReal ? 'REAL' : 'LARP'}
                  </span>
                </p>
              )}
            </div>

            {/* ---- the personal slice ---- */}
            {heldBefore && (
              <div className="ovr-rise mt-5">
                <YourResult held={heldBefore} isReal={isReal} />
              </div>
            )}
          </div>
        )}

        <p className="mt-6 text-[10px] tracking-[0.2em] text-muted/70 uppercase">
          {queuedBehind > 0 ? (
            <span className="tnum">{queuedBehind} more resolving…</span>
          ) : (
            'Tap to dismiss'
          )}
        </p>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div>
      <p className="text-[9px] font-bold tracking-[0.2em] text-muted uppercase">
        {label}
      </p>
      <p className={`tnum mt-0.5 text-xl font-black ${tone}`}>{value}</p>
    </div>
  );
}

export default RevealModal;
