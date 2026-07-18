'use client';

// THROWAWAY Phase-A page. Its only job is to prove the pipe is live:
// open two tabs, buy in one, odds must move in the other within ~1s.
// Not styled, not mobile-first, not the real UI. Delete before the booth.

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  fmtBps,
  fmtCents,
  fmtCountdown,
  msUntil,
  priceNoCents,
  priceYesCents,
  RESOLVE_POLL_MS,
  type MarketPublic,
  type Player,
  type Side,
  type TradeResult,
} from '@/lib/types';

function usePlayerId() {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    let v = localStorage.getItem('ov_player_id');
    if (!v) {
      v = crypto.randomUUID();
      localStorage.setItem('ov_player_id', v);
    }
    setId(v);
  }, []);
  return id;
}

export default function DebugPage() {
  const playerId = usePlayerId();
  const [player, setPlayer] = useState<Player | null>(null);
  const [markets, setMarkets] = useState<MarketPublic[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [rtStatus, setRtStatus] = useState('connecting');
  const [, forceTick] = useState(0);
  const bootstrapped = useRef(false);

  const say = useCallback((m: string) => {
    setLog((l) => [`${new Date().toLocaleTimeString()} ${m}`, ...l].slice(0, 20));
  }, []);

  const loadMarkets = useCallback(async () => {
    const { data, error } = await supabase
      .from('markets_public')
      .select('*')
      .order('expires_at', { ascending: true });
    if (error) return say(`load error: ${error.message}`);
    setMarkets((data ?? []) as MarketPublic[]);
  }, [say]);

  const loadPlayer = useCallback(async () => {
    if (!playerId) return;
    const { data, error } = await supabase.rpc('ensure_player', {
      p_id: playerId,
      p_handle: `debug-${playerId.slice(0, 4)}`,
    });
    if (error) return say(`player error: ${error.message}`);
    setPlayer(data as unknown as Player);
  }, [playerId, say]);

  // bootstrap
  useEffect(() => {
    if (!playerId || bootstrapped.current) return;
    bootstrapped.current = true;
    loadPlayer();
    loadMarkets();
  }, [playerId, loadPlayer, loadMarkets]);

  // THE CRITICAL BIT: realtime on markets
  useEffect(() => {
    const ch = supabase
      .channel('debug-markets')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'markets' },
        (payload) => {
          const row = payload.new as Partial<MarketPublic> & { id?: string };
          if (!row?.id) return;
          say(`RT ${payload.eventType} ${row.id.slice(0, 8)} -> ${row.prob_yes_bps}bps`);
          setMarkets((prev) => {
            const hit = prev.find((m) => m.id === row.id);
            // INSERT of a brand-new market, or a status flip we can't fully
            // trust from the wire (is_real is not in the payload) -> refetch.
            if (!hit || (row.status === 'resolved' && hit.status !== 'resolved')) {
              loadMarkets();
              return prev;
            }
            return prev.map((m) => (m.id === row.id ? { ...m, ...row } : m));
          });
        },
      )
      .subscribe((s) => setRtStatus(s));
    return () => {
      supabase.removeChannel(ch);
    };
  }, [say, loadMarkets]);

  // 2s resolve poll + 1s countdown repaint
  useEffect(() => {
    const resolve = setInterval(async () => {
      const { data } = await supabase.rpc('resolve_expired');
      if (typeof data === 'number' && data > 0) {
        say(`resolved ${data} market(s)`);
        loadMarkets();
        loadPlayer();
      }
    }, RESOLVE_POLL_MS);
    const paint = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => {
      clearInterval(resolve);
      clearInterval(paint);
    };
  }, [say, loadMarkets, loadPlayer]);

  async function buy(marketId: string, side: Side) {
    if (!playerId) return;
    const { data, error } = await supabase.rpc('trade', {
      p_player: playerId,
      p_market: marketId,
      p_side: side,
      p_action: 'buy',
      p_shares: 1,
    });
    if (error) return say(`trade error: ${error.message}`);
    const r = data as unknown as TradeResult;
    say(r.ok ? `bought 1 ${side.toUpperCase()} @ ${r.price_cents}c -> ${r.prob_yes_bps}bps` : `rejected: ${r.error}`);
    if (r.ok) {
      setPlayer((p) => (p && r.cash != null ? { ...p, cash: r.cash } : p));
      // optimistic; realtime will confirm
      setMarkets((prev) =>
        prev.map((m) => (m.id === marketId && r.prob_yes_bps != null ? { ...m, prob_yes_bps: r.prob_yes_bps } : m)),
      );
    }
  }

  return (
    <main style={{ fontFamily: 'ui-monospace, monospace', padding: 16, maxWidth: 900 }}>
      <h1>/debug — pipe check</h1>
      <p>
        realtime: <b>{rtStatus}</b> · player: {player?.handle ?? '…'} · cash:{' '}
        <b>{player ? fmtCents(player.cash) : '…'}</b> · ref: {player?.ref_code ?? '…'}
      </p>
      <button onClick={() => { loadMarkets(); loadPlayer(); }}>refetch</button>{' '}
      <button onClick={async () => { await supabase.rpc('bot_tick'); }}>bot_tick</button>{' '}
      <button onClick={async () => { await supabase.rpc('reset_game'); loadMarkets(); loadPlayer(); }}>
        reset_game
      </button>

      <table style={{ width: '100%', marginTop: 16, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid #999' }}>
            <th>title</th><th>YES</th><th>bps</th><th>left</th><th>status</th><th>is_real</th><th>trade</th>
          </tr>
        </thead>
        <tbody>
          {markets.map((m) => (
            <tr key={m.id} style={{ borderBottom: '1px solid #ddd' }}>
              <td style={{ maxWidth: 260 }}>{m.title}</td>
              <td><b style={{ fontSize: 18 }}>{fmtBps(m.prob_yes_bps)}</b></td>
              <td>{m.prob_yes_bps}</td>
              <td>{m.status === 'active' ? fmtCountdown(msUntil(m.expires_at)) : '—'}</td>
              <td>{m.status}</td>
              <td>{m.is_real === null ? '🔒' : m.is_real ? 'REAL' : 'LARP'}</td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <button disabled={m.status !== 'active'} onClick={() => buy(m.id, 'yes')}>
                  +1 YES {priceYesCents(m.prob_yes_bps)}c
                </button>{' '}
                <button disabled={m.status !== 'active'} onClick={() => buy(m.id, 'no')}>
                  +1 NO {priceNoCents(m.prob_yes_bps)}c
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <pre style={{ marginTop: 16, background: '#111', color: '#0f0', padding: 12, fontSize: 12 }}>
        {log.join('\n')}
      </pre>
    </main>
  );
}
