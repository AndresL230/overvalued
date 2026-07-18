'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface HostPanelProps {
  /** Live count of active markets, passed down by Phase C. */
  activeCount: number;
}

type LogLine = { id: number; text: string; bad?: boolean };

const ARM_MS = 6000;

/**
 * The booth operator's console. Deliberately ugly and deliberately not part of
 * the player UI — it lives collapsed in a corner and only the person running
 * the booth should ever open it.
 *
 * This is the one component allowed to call the mutating RPCs directly.
 */
export function HostPanel({ activeCount }: HostPanelProps) {
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<LogLine[]>([]);
  const seq = useRef(0);

  const push = useCallback((text: string, bad = false) => {
    seq.current += 1;
    const line = { id: seq.current, text, bad };
    setLog((prev) => [line, ...prev].slice(0, 8));
  }, []);

  // Arming is a dead-man switch: it disarms itself so a stray first tap can
  // never sit there waiting to wipe the board an hour later.
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), ARM_MS);
    return () => clearTimeout(t);
  }, [armed]);

  const stamp = () =>
    new Date().toLocaleTimeString('en-US', { hour12: false });

  const runResolve = async () => {
    setBusy('resolve');
    const { data, error } = await supabase.rpc('resolve_expired');
    setBusy(null);
    if (error) push(`${stamp()}  resolve_expired FAILED: ${error.message}`, true);
    else push(`${stamp()}  resolve_expired → ${data ?? 0} resolved`);
  };

  const runBotTick = async () => {
    setBusy('bots');
    const { error } = await supabase.rpc('bot_tick');
    setBusy(null);
    if (error) push(`${stamp()}  bot_tick FAILED: ${error.message}`, true);
    else push(`${stamp()}  bot_tick → ok`);
  };

  const runReset = async () => {
    if (!armed) {
      setArmed(true);
      return;
    }
    setArmed(false);
    setBusy('reset');
    const { error } = await supabase.rpc('reset_game');
    setBusy(null);
    if (error) push(`${stamp()}  reset_game FAILED: ${error.message}`, true);
    else push(`${stamp()}  reset_game → BOARD WIPED, all players $100`, true);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Open host panel"
        className="fixed right-2 bottom-2 z-40 rounded border border-line bg-ink/80 px-2 py-1 font-mono text-[9px] tracking-[0.2em] text-muted/60 uppercase hover:text-fg"
      >
        ops
      </button>
    );
  }

  return (
    <aside
      aria-label="Host panel"
      className="fixed right-2 bottom-2 z-40 w-[19rem] max-w-[calc(100vw-1rem)] rounded border border-line bg-ink font-mono shadow-2xl"
    >
      <header className="flex items-center justify-between border-b border-line px-2.5 py-1.5">
        <span className="text-[9px] font-bold tracking-[0.22em] text-muted uppercase">
          ops console
        </span>
        <button
          onClick={() => {
            setOpen(false);
            setArmed(false);
          }}
          aria-label="Close host panel"
          className="px-1 text-[11px] leading-none text-muted hover:text-fg"
        >
          ×
        </button>
      </header>

      <div className="flex items-baseline justify-between border-b border-line px-2.5 py-2">
        <span className="text-[9px] tracking-[0.18em] text-muted uppercase">
          active markets
        </span>
        <span className="tnum text-lg font-black text-fg">{activeCount}</span>
      </div>

      <div className="flex flex-col gap-1.5 p-2.5">
        <OpsButton
          onClick={runResolve}
          disabled={busy !== null}
          busy={busy === 'resolve'}
          label="resolve_expired()"
        />
        <OpsButton
          onClick={runBotTick}
          disabled={busy !== null}
          busy={busy === 'bots'}
          label="bot_tick()"
        />

        <div className="mt-1 border-t border-line pt-2">
          <button
            onClick={runReset}
            disabled={busy !== null}
            className={[
              'w-full rounded border px-2 py-2 text-[10px] font-bold tracking-[0.14em] uppercase transition-colors disabled:opacity-40',
              armed
                ? 'border-no bg-no/20 text-no pulse-urgent'
                : 'border-line bg-surface text-muted hover:text-fg',
            ].join(' ')}
          >
            {busy === 'reset'
              ? 'wiping…'
              : armed
                ? '⚠ tap again to WIPE EVERYTHING'
                : 'reset_game()'}
          </button>
          <p className="mt-1 text-[9px] leading-snug tracking-[0.08em] text-muted/70 uppercase">
            {armed
              ? `disarms in ${ARM_MS / 1000}s — deletes all markets, trades and positions`
              : 'two-tap. wipes board, resets every player to $100, reseeds bots.'}
          </p>
        </div>
      </div>

      {log.length > 0 && (
        <div className="max-h-32 overflow-y-auto border-t border-line px-2.5 py-2">
          {log.map((l) => (
            <p
              key={l.id}
              className={[
                'tnum text-[9px] leading-relaxed break-words',
                l.bad ? 'text-no' : 'text-muted',
              ].join(' ')}
            >
              {l.text}
            </p>
          ))}
        </div>
      )}
    </aside>
  );
}

function OpsButton({
  onClick,
  disabled,
  busy,
  label,
}: {
  onClick: () => void;
  disabled: boolean;
  busy: boolean;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full rounded border border-line bg-surface px-2 py-1.5 text-left text-[10px] tracking-[0.1em] text-fg transition-colors hover:bg-surface-2 disabled:opacity-40"
    >
      {busy ? '…running' : label}
    </button>
  );
}

export default HostPanel;
