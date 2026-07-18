"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatCountdown, initialMarkets, initialTape, leaderboard, type Market } from "@/lib/market-data";

function BoardChart({ market }: { market: Market }) {
  const min = Math.max(0, Math.min(...market.history) - 8);
  const max = Math.min(100, Math.max(...market.history) + 8);
  const range = Math.max(1, max - min);
  return (
    <div className="board-chart" role="img" aria-label={`Live probability chart, now ${market.probability}% YES`}>
      <div className="board-chart__bars" aria-hidden="true">
        {market.history.map((value, index) => (
          <span key={`${value}-${index}`} style={{ height: `${12 + ((value - min) / range) * 84}%` }} />
        ))}
      </div>
      <div className="board-chart__line"><span style={{ width: `${market.probability}%` }} /><i style={{ left: `${market.probability}%` }} /></div>
      <div className="board-chart__labels"><span>LARP · 0</span><span>MARKET CONSENSUS</span><span>100 · REAL</span></div>
    </div>
  );
}

export function BoardScreen() {
  const [markets, setMarkets] = useState(initialMarkets.map((market, index) => ({ ...market, closesIn: market.closesIn + index * 24 })));
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setMarkets((current) => current.map((market) => ({ ...market, closesIn: Math.max(0, market.closesIn - 1) })));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setActiveIndex((current) => (current + 1) % markets.length), 9000);
    return () => window.clearInterval(timer);
  }, [markets.length]);

  const ordered = useMemo(() => [...markets].sort((a, b) => a.closesIn - b.closesIn), [markets]);
  const market = ordered[activeIndex % ordered.length];

  return (
    <main className="board-shell">
      <header className="board-header">
        <div className="board-wordmark"><span>OVER<span>VALUED</span></span><small>CANDIDATE EXCHANGE · NYC</small></div>
        <div className="board-status"><span><i /> LIVE</span><strong>{markets.length} OPEN MARKETS</strong><strong>ROOM OV-NYC</strong></div>
        <Link href="/">PHONE VIEW ↗</Link>
      </header>

      <section className="board-main">
        <article className="board-stage">
          <div className="board-kicker"><span>NEXT REFERENCE CHECK · {market.id}</span><strong>{formatCountdown(market.closesIn)}</strong></div>
          <h1>{market.title}</h1>
          <div className="board-sub"><span>OPENED BY {market.handle}</span><span>ASKING TC <strong>{market.askingTc}</strong></span></div>
          <div className="board-odds-row">
            <div className="board-odds"><strong>{market.probability}<sup>%</sup></strong><span>YES · PASSES</span><small>{market.change >= 0 ? "+" : ""}{market.change} PTS SINCE OPEN</small></div>
            <BoardChart market={market} />
          </div>
          <div className="board-claims"><span>CLAIMS ON FILE</span>{market.claims.map((claim, index) => <div key={claim}><small>{String(index + 1).padStart(2, "0")}</small><strong>{claim}</strong><span>SELF-REPORTED</span></div>)}</div>
        </article>

        <aside className="board-sidebar">
          <div className="join-board">
            <span>TRADE FROM YOUR PHONE</span>
            <strong>OVERVALUED.PARTY</strong>
            <div><span>NO LOGIN</span><span>$100 PLAY CASH</span></div>
          </div>
          <section className="closing-queue">
            <div className="board-section-head"><span>CLOSING QUEUE</span><span>AUTO-ROTATE ON</span></div>
            {ordered.slice(0, 4).map((item, index) => (
              <div className={item.id === market.id ? "active" : ""} key={item.id}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <p><strong>{item.id}</strong>{item.title}</p>
                <b>{item.probability}%</b>
                <time>{formatCountdown(item.closesIn)}</time>
              </div>
            ))}
          </section>
          <section className="board-leaders">
            <div className="board-section-head"><span>BEST TRADERS</span><span>LIVE EQUITY</span></div>
            {leaderboard.slice(0, 3).map((player) => <div key={player.rank}><span>0{player.rank}</span><strong>{player.handle}</strong><b>{player.value}</b><small>{player.move}</small></div>)}
          </section>
        </aside>
      </section>

      <footer className="board-tape">
        <span><i /> LIVE FILLS</span>
        <div>{[...initialTape, ...initialTape].map((item, index) => <p key={`${item.id}-${index}`}><strong>{item.handle}</strong> {item.action} {item.shares} {item.side} · {item.marketId} · <b className={item.side === "YES" ? "yes-text" : "no-text"}>{item.price}¢</b></p>)}</div>
      </footer>
    </main>
  );
}
