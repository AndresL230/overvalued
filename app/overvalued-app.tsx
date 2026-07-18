"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  formatCountdown,
  formatMoney,
  initialMarkets,
  initialTape,
  leaderboard,
  type Market,
  type TradeTapeItem,
} from "@/lib/market-data";

type Side = "YES" | "NO";
type TradeMode = "BUY" | "SELL";
type Modal = "create" | "portfolio" | "rankings" | null;
type Position = { YES: number; NO: number };

const randomResumes = [
  {
    title: "Fractional CTO who migrated one endpoint and called it a platform",
    askingTc: "$440K",
    claims: [
      "Introduced observability by opening the logs tab",
      "Advised six startups from a group chat",
      "Coined the phrase agent-native infrastructure",
    ],
  },
  {
    title: "Product savant who interviewed their roommate as the target user",
    askingTc: "$360K",
    claims: [
      "Found product-market fit in a 12-person Discord",
      "Shipped seven pivots without changing the domain",
      "Keeps the roadmap intentionally non-linear",
    ],
  },
  {
    title: "10x engineer whose benchmark only runs on their laptop",
    askingTc: "$525K",
    claims: [
      "Reduced local latency by 94%",
      "Maintains a fork the community is not ready for",
      "Has strong opinions about every package manager",
    ],
  },
];

function ProbabilityChart({ values, compact = false }: { values: number[]; compact?: boolean }) {
  const min = Math.max(0, Math.min(...values) - 8);
  const max = Math.min(100, Math.max(...values) + 8);
  const range = Math.max(1, max - min);

  return (
    <div className={`probability-chart ${compact ? "probability-chart--compact" : ""}`} role="img" aria-label={`Recent probability movement, now ${values.at(-1) ?? 50}%`}>
      {!compact && (
        <div className="chart-scale" aria-hidden="true">
          <span>{max}%</span>
          <span>{Math.round((max + min) / 2)}%</span>
          <span>{min}%</span>
        </div>
      )}
      <div className="chart-bars" aria-hidden="true">
        {values.map((value, index) => (
          <span
            className="chart-bar"
            key={`${value}-${index}`}
            style={{ height: `${16 + ((value - min) / range) * 76}%` }}
          />
        ))}
      </div>
      {!compact && (
        <div className="chart-axis" aria-hidden="true">
          <span>OPEN</span>
          <span>10 MIN</span>
          <span>NOW</span>
        </div>
      )}
    </div>
  );
}

function ProbabilityRail({ probability }: { probability: number }) {
  return (
    <div className="probability-rail" aria-label={`${probability}% YES probability`}>
      <div className="probability-rail__fill" style={{ width: `${probability}%` }} />
      <div className="probability-rail__marker" style={{ left: `${probability}%` }} />
    </div>
  );
}

function LiveTape({ items }: { items: TradeTapeItem[] }) {
  const doubled = [...items, ...items];
  return (
    <div className="live-tape" aria-label="Live trades">
      <span className="live-tape__label"><i /> LIVE TAPE</span>
      <div className="live-tape__viewport" aria-hidden="true">
        <div className="live-tape__track">
          {doubled.map((item, index) => (
            <span className="tape-trade" key={`${item.id}-${index}`}>
              <strong>{item.handle}</strong> {item.action} {item.shares} {item.side}
              <span className={item.side === "YES" ? "yes-text" : "no-text"}>{item.price}¢</span>
              <span className="tape-market">{item.marketId}</span>
            </span>
          ))}
        </div>
      </div>
      <span className="live-tape__clock">NYC · 14:32:08</span>
    </div>
  );
}

function MarketRow({
  market,
  selected,
  onSelect,
  onTrade,
}: {
  market: Market;
  selected: boolean;
  onSelect: () => void;
  onTrade: (side: Side) => void;
}) {
  const noPrice = 100 - market.probability;
  return (
    <article className={`market-row ${selected ? "market-row--selected" : ""}`}>
      <button className="market-row__main" onClick={onSelect} aria-pressed={selected}>
        <span className="market-row__meta">
          <span>{market.id}</span>
          <span className={market.closesIn < 180 ? "closing-soon" : ""}>
            {formatCountdown(market.closesIn)}
          </span>
        </span>
        <span className="market-row__title">{market.title}</span>
        <span className="market-row__sub">
          <span>ASK {market.askingTc}</span>
          <span>{market.sharesTraded} SHARES</span>
        </span>
        <span className="market-row__visual">
          <ProbabilityChart values={market.history} compact />
          <span className="market-row__odds">
            <strong>{market.probability}%</strong>
            <small className={market.change >= 0 ? "positive" : "negative"}>
              {market.change >= 0 ? "+" : ""}{market.change} pts
            </small>
          </span>
        </span>
      </button>
      <div className="market-row__actions">
        <button className="micro-trade micro-trade--yes" onClick={() => onTrade("YES")}>
          YES <strong>{market.probability}¢</strong>
        </button>
        <button className="micro-trade micro-trade--no" onClick={() => onTrade("NO")}>
          NO <strong>{noPrice}¢</strong>
        </button>
      </div>
    </article>
  );
}

function TradeTicket({
  market,
  side,
  mode,
  shares,
  cash,
  position,
  mobileOpen,
  onClose,
  onSide,
  onMode,
  onShares,
  onSubmit,
}: {
  market: Market;
  side: Side;
  mode: TradeMode;
  shares: number;
  cash: number;
  position: Position;
  mobileOpen: boolean;
  onClose: () => void;
  onSide: (side: Side) => void;
  onMode: (mode: TradeMode) => void;
  onShares: (shares: number) => void;
  onSubmit: () => void;
}) {
  const price = side === "YES" ? market.probability : 100 - market.probability;
  const total = price * shares;
  const profit = shares * 100 - total;
  const owned = position[side];
  const insufficientCash = mode === "BUY" && total > cash;
  const insufficientShares = mode === "SELL" && shares > owned;
  const disabled = shares < 1 || insufficientCash || insufficientShares;

  return (
    <aside
      className={`trade-ticket ${mobileOpen ? "trade-ticket--open" : ""}`}
      role={mobileOpen ? "dialog" : "complementary"}
      aria-modal={mobileOpen || undefined}
      aria-labelledby={`ticket-title-${market.id}`}
    >
      <div className="trade-ticket__mobile-head">
        <span>QUICK TICKET</span>
        <button onClick={onClose} aria-label="Close trade ticket">CLOSE ×</button>
      </div>
      <div className="ticket-context">
        <span>{market.id} · REFERENCE CHECK</span>
        <h2 id={`ticket-title-${market.id}`}>{market.title}</h2>
        <div><span>{market.handle}</span><span>CLOSES {formatCountdown(market.closesIn)}</span></div>
      </div>

      <div className="ticket-mode" role="group" aria-label="Buy or sell">
        {(["BUY", "SELL"] as TradeMode[]).map((item) => (
          <button aria-pressed={mode === item} className={mode === item ? "active" : ""} key={item} onClick={() => onMode(item)}>{item}</button>
        ))}
      </div>

      <div className="side-selector" role="group" aria-label="Choose outcome">
        <button aria-pressed={side === "YES"} className={side === "YES" ? "active yes" : ""} onClick={() => onSide("YES")}>
          <span>YES · PASSES</span><strong>{market.probability}¢</strong>
        </button>
        <button aria-pressed={side === "NO"} className={side === "NO" ? "active no" : ""} onClick={() => onSide("NO")}>
          <span>NO · LARP</span><strong>{100 - market.probability}¢</strong>
        </button>
      </div>

      <div className="ticket-section-label"><span>CONTRACTS</span><span>OWNED {owned}</span></div>
      <div className="share-stepper">
        <button onClick={() => onShares(Math.max(1, shares - 1))} aria-label="Decrease contracts">−</button>
        <label>
          <span className="sr-only">Number of contracts</span>
          <input type="number" min="1" value={shares} onChange={(event) => onShares(Math.max(1, Number(event.target.value) || 1))} />
        </label>
        <button onClick={() => onShares(shares + 1)} aria-label="Increase contracts">+</button>
      </div>
      <div className="quick-amounts">
        {[1, 5, 10].map((amount) => <button key={amount} onClick={() => onShares(amount)}>{amount}</button>)}
        <button onClick={() => onShares(mode === "BUY" ? Math.max(1, Math.min(50, Math.floor(cash / Math.max(1, price)))) : Math.max(1, owned))}>MAX</button>
      </div>

      <dl className="trade-economics">
        <div><dt>{mode === "BUY" ? "ESTIMATED COST" : "ESTIMATED CREDIT"}</dt><dd>{formatMoney(total)}</dd></div>
        <div><dt>PAYS IF {side === "YES" ? "REAL" : "LARP"}</dt><dd>{formatMoney(shares * 100)}</dd></div>
        <div className="profit-line"><dt>POTENTIAL PROFIT</dt><dd>+{formatMoney(profit)}</dd></div>
        <div><dt>AVAILABLE CASH</dt><dd>{formatMoney(cash)}</dd></div>
      </dl>

      {(insufficientCash || insufficientShares) && (
        <p className="ticket-error">{insufficientCash ? "Not enough cash for this order." : `You only hold ${owned} ${side}.`}</p>
      )}
      <button
        className={`submit-trade submit-trade--${side.toLowerCase()}`}
        disabled={disabled}
        onClick={onSubmit}
      >
        {mode} {shares} {side} · {formatMoney(total)}
      </button>
      <p className="ticket-fineprint">Settles at $1.00 if correct. Game credits have no cash value.</p>
    </aside>
  );
}

export function OvervaluedApp() {
  const [markets, setMarkets] = useState(initialMarkets);
  const [selectedId, setSelectedId] = useState(initialMarkets[0].id);
  const [tape, setTape] = useState(initialTape);
  const [side, setSide] = useState<Side>("YES");
  const [mode, setMode] = useState<TradeMode>("BUY");
  const [shares, setShares] = useState(5);
  const [cash, setCash] = useState(10000);
  const [positions, setPositions] = useState<Record<string, Position>>({
    "OV-042": { YES: 6, NO: 0 },
    "OV-031": { YES: 0, NO: 4 },
  });
  const [sort, setSort] = useState<"ending" | "move" | "traded">("ending");
  const [query, setQuery] = useState("");
  const [mobileTicket, setMobileTicket] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [rollIndex, setRollIndex] = useState(0);
  const [draft, setDraft] = useState({
    title: "",
    askingTc: "$350K",
    claims: ["", "", ""],
    truth: "REAL" as "REAL" | "LARP",
  });
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setMarkets((current) => current.map((market) => market.status === "active" && market.closesIn > 0
        ? { ...market, closesIn: market.closesIn - 1 }
        : market));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setMarkets((current) => {
        const active = current.filter((market) => market.status === "active");
        if (!active.length) return current;
        const chosen = active[Math.floor(Date.now() / 4200) % active.length];
        const direction = Math.floor(Date.now() / 4200) % 2 === 0 ? 1 : -1;
        return current.map((market) => market.id === chosen.id
          ? {
              ...market,
              probability: Math.max(2, Math.min(98, market.probability + direction)),
              change: market.change + direction,
              history: [...market.history.slice(-15), Math.max(2, Math.min(98, market.probability + direction))],
            }
          : market);
      });
    }, 4200);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!modal && !mobileTicket) return;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = document.querySelector<HTMLElement>("[role='dialog'][aria-modal='true']");
    const focusableSelector = "button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";
    const focusable = dialog ? Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector)) : [];
    window.requestAnimationFrame(() => focusable[0]?.focus());

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setModal(null);
        setMobileTicket(false);
        return;
      }
      if (event.key !== "Tab" || focusable.length === 0) return;
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
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      previousFocus.current?.focus();
    };
  }, [modal, mobileTicket]);

  const selected = markets.find((market) => market.id === selectedId) ?? markets[0];
  const position = positions[selected.id] ?? { YES: 0, NO: 0 };

  const visibleMarkets = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const filtered = markets.filter((market) => !normalized || [market.title, market.handle, market.id, ...market.claims]
      .some((value) => value.toLowerCase().includes(normalized)));
    return [...filtered].sort((a, b) => {
      if (sort === "move") return Math.abs(b.change) - Math.abs(a.change);
      if (sort === "traded") return b.sharesTraded - a.sharesTraded;
      return a.closesIn - b.closesIn;
    });
  }, [markets, query, sort]);

  function openTrade(market: Market, nextSide: Side) {
    setSelectedId(market.id);
    setSide(nextSide);
    setMode("BUY");
    setShares(5);
    setMobileTicket(true);
  }

  function executeTrade() {
    const price = side === "YES" ? selected.probability : 100 - selected.probability;
    const total = price * shares;
    const owned = position[side];
    if ((mode === "BUY" && total > cash) || (mode === "SELL" && shares > owned)) return;

    const direction = side === "YES" ? 1 : -1;
    const signedDirection = mode === "BUY" ? direction : -direction;
    const impact = Math.max(1, Math.min(8, Math.ceil(shares / 3)));
    const nextProbability = Math.max(2, Math.min(98, selected.probability + signedDirection * impact));
    const nextPosition = Math.max(0, owned + (mode === "BUY" ? shares : -shares));

    setCash((current) => current + (mode === "BUY" ? -total : total));
    setPositions((current) => ({
      ...current,
      [selected.id]: { ...position, [side]: nextPosition },
    }));
    setMarkets((current) => current.map((market) => market.id === selected.id ? {
      ...market,
      probability: nextProbability,
      change: market.change + signedDirection * impact,
      sharesTraded: market.sharesTraded + shares,
      history: [...market.history.slice(-15), nextProbability],
    } : market));
    const trade: TradeTapeItem = {
      id: `local-${Date.now()}`,
      handle: "@margin_goblin",
      action: mode === "BUY" ? "BOUGHT" : "SOLD",
      shares,
      side,
      marketId: selected.id,
      price,
    };
    setTape((current) => [trade, ...current].slice(0, 6));
    setToast(`FILLED · ${shares} ${side} @ ${price}¢ · ${selected.probability}¢ → ${nextProbability}¢`);
  }

  function rollResume() {
    const next = randomResumes[rollIndex % randomResumes.length];
    setRollIndex((current) => current + 1);
    setDraft((current) => ({ ...current, ...next }));
  }

  function createMarket(event: FormEvent) {
    event.preventDefault();
    const title = draft.title.trim();
    if (!title) return;
    const id = `OV-${String(60 + markets.length).padStart(3, "0")}`;
    const market: Market = {
      id,
      handle: "@margin_goblin",
      title,
      askingTc: draft.askingTc || "$350K",
      probability: 50,
      change: 0,
      closesIn: 900,
      claims: draft.claims.map((claim) => claim.trim()).filter(Boolean).slice(0, 3),
      history: Array.from({ length: 16 }, () => 50),
      sharesTraded: 0,
      status: "active",
      isReal: draft.truth === "REAL",
    };
    setMarkets((current) => [market, ...current]);
    setSelectedId(id);
    setModal(null);
    setToast("MARKET OPEN · Reference check closes in 15:00");
    setDraft({ title: "", askingTc: "$350K", claims: ["", "", ""], truth: "REAL" });
  }

  return (
    <main className="exchange-shell">
      <header className="exchange-header">
        <button className="wordmark" onClick={() => setSelectedId(markets[0].id)} aria-label="Overvalued markets home">
          <span>OVER<span className="wordmark-strike">VALUED</span></span>
          <small>CANDIDATE EXCHANGE · NYC</small>
        </button>
        <nav className="desktop-nav" aria-label="Primary navigation">
          <button className="active">MARKETS <span>{markets.length}</span></button>
          <button onClick={() => setModal("portfolio")}>PORTFOLIO</button>
          <button onClick={() => setModal("rankings")}>RANKINGS</button>
          <Link href="/board">BOOTH BOARD ↗</Link>
        </nav>
        <div className="header-actions">
          <button className="cash-button" onClick={() => setModal("portfolio")}>
            <span>CASH</span><strong>{formatMoney(cash)}</strong>
          </button>
          <button className="list-button" onClick={() => setModal("create")}>＋ LIST YOURSELF</button>
        </div>
      </header>

      <LiveTape items={tape} />

      <section className="exchange-workspace">
        <aside className="market-queue" aria-label="Open candidate markets">
          <div className="queue-head">
            <div><span>OPEN MARKETS</span><strong>{markets.length}</strong></div>
            <label className="search-field">
              <span className="sr-only">Search markets</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="SEARCH CANDIDATES" />
              <span aria-hidden="true">⌕</span>
            </label>
            <div className="sort-tabs" role="group" aria-label="Sort markets">
              <button aria-pressed={sort === "ending"} className={sort === "ending" ? "active" : ""} onClick={() => setSort("ending")}>ENDING</button>
              <button aria-pressed={sort === "move"} className={sort === "move" ? "active" : ""} onClick={() => setSort("move")}>MOVERS</button>
              <button aria-pressed={sort === "traded"} className={sort === "traded" ? "active" : ""} onClick={() => setSort("traded")}>VOLUME</button>
            </div>
          </div>
          <div className="queue-list">
            {visibleMarkets.map((market) => (
              <MarketRow
                key={market.id}
                market={market}
                selected={market.id === selected.id}
                onSelect={() => setSelectedId(market.id)}
                onTrade={(nextSide) => openTrade(market, nextSide)}
              />
            ))}
          </div>
        </aside>

        <section className="market-stage">
          <div className="stage-kicker">
            <span><i /> LIVE MARKET</span>
            <span>{selected.id} · SELF-SUBMITTED</span>
            <span className={selected.closesIn < 180 ? "closing-soon" : ""}>CLOSES {formatCountdown(selected.closesIn)}</span>
          </div>
          <div className="stage-title-row">
            <div>
              <p>REFERENCE CHECK</p>
              <h1>{selected.title}</h1>
              <span className="stage-handle">OPENED BY {selected.handle}</span>
            </div>
            <div className="stage-probability">
              <strong>{selected.probability}<sup>%</sup></strong>
              <span>YES · PASSES</span>
              <small className={selected.change >= 0 ? "positive" : "negative"}>
                {selected.change >= 0 ? "▲" : "▼"} {Math.abs(selected.change)} PTS
              </small>
            </div>
          </div>

          <div className="stage-chart-card">
            <div className="chart-head">
              <div><span>MARKET PROBABILITY</span><strong>{selected.probability}¢</strong></div>
              <div><span>NO PRICE</span><strong>{100 - selected.probability}¢</strong></div>
              <div><span>SHARES TRADED</span><strong>{selected.sharesTraded}</strong></div>
            </div>
            <ProbabilityChart values={selected.history} />
            <ProbabilityRail probability={selected.probability} />
            <div className="rail-labels"><span>0 · LARP</span><span>50 · TOO CLOSE</span><span>100 · REAL</span></div>
          </div>

          <div className="mobile-stage-actions">
            <button className="mobile-yes" onClick={() => openTrade(selected, "YES")}>BUY YES · {selected.probability}¢</button>
            <button className="mobile-no" onClick={() => openTrade(selected, "NO")}>BUY NO · {100 - selected.probability}¢</button>
          </div>

          <article className="resume-dossier">
            <div className="dossier-seal"><span>SEALED SELF-ATTESTATION</span><span>{selected.id}</span></div>
            <div className="dossier-head">
              <div><span>CANDIDATE</span><strong>{selected.handle.replace("@", "").replaceAll("_", " ")}</strong></div>
              <div><span>ASKING TC</span><strong>{selected.askingTc}</strong></div>
              <div><span>STATUS</span><strong>REFERENCE PENDING</strong></div>
            </div>
            <div className="dossier-section-label"><span>CLAIMS ON FILE</span><span>3 ITEMS</span></div>
            <ol className="claim-list">
              {selected.claims.map((claim, index) => (
                <li key={claim}><span>{String(index + 1).padStart(2, "0")}</span><strong>{claim}</strong><small>SELF-REPORTED</small></li>
              ))}
            </ol>
            <p className="ego-safety">Submitted by the candidate. Trade the claim, not the person.</p>
          </article>

          <section className="market-activity" aria-label="Recent market activity">
            <div className="section-heading"><span>RECENT ACTIVITY</span><span>LIVE</span></div>
            {tape.filter((item) => item.marketId === selected.id).slice(0, 3).map((item) => (
              <div className="activity-row" key={item.id}>
                <span>{item.handle}</span><span>{item.action} {item.shares} {item.side}</span><strong>{item.price}¢</strong>
              </div>
            ))}
            {!tape.some((item) => item.marketId === selected.id) && <p className="empty-activity">No fills in the last minute.</p>}
          </section>
        </section>

        <TradeTicket
          market={selected}
          side={side}
          mode={mode}
          shares={shares}
          cash={cash}
          position={position}
          mobileOpen={mobileTicket}
          onClose={() => setMobileTicket(false)}
          onSide={setSide}
          onMode={setMode}
          onShares={setShares}
          onSubmit={executeTrade}
        />
      </section>

      {mobileTicket && <button className="mobile-backdrop" aria-label="Close trade ticket" onClick={() => setMobileTicket(false)} />}

      <nav className="mobile-nav" aria-label="Mobile navigation">
        <button className="active"><span>⌁</span>MARKETS</button>
        <button onClick={() => setModal("portfolio")}><span>$</span>PORTFOLIO</button>
        <button className="mobile-list" onClick={() => setModal("create")}><span>＋</span>LIST</button>
        <button onClick={() => setModal("rankings")}><span>↗</span>RANKINGS</button>
      </nav>

      {modal === "create" && (
        <div className="modal-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setModal(null)}>
          <section className="create-modal" role="dialog" aria-modal="true" aria-labelledby="create-title">
            <div className="modal-head"><div><span>NEW LISTING</span><h2 id="create-title">List your résumé</h2></div><button onClick={() => setModal(null)}>CLOSE ×</button></div>
            <div className="create-grid">
              <form onSubmit={createMarket}>
                <p className="form-intro">Open a 15-minute market on your own résumé. Your settlement choice stays sealed until close.</p>
                <label className="field"><span>HEADLINE</span><textarea required value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Chief Vibes Officer who..." /></label>
                <div className="claims-field"><span>RÉSUMÉ CLAIMS</span>{draft.claims.map((claim, index) => <label key={index}><span>{String(index + 1).padStart(2, "0")}</span><input required={index === 0} value={claim} onChange={(event) => setDraft((current) => ({ ...current, claims: current.claims.map((item, itemIndex) => itemIndex === index ? event.target.value : item) }))} placeholder="One suspiciously impressive bullet" /></label>)}</div>
                <label className="field field--short"><span>ASKING TC</span><input value={draft.askingTc} onChange={(event) => setDraft((current) => ({ ...current, askingTc: event.target.value }))} /></label>
                <div className="truth-field"><div><span>SETTLEMENT TRUTH</span><small>HIDDEN UNTIL THIS MARKET RESOLVES</small></div><div>{(["REAL", "LARP"] as const).map((truth) => <button type="button" key={truth} aria-pressed={draft.truth === truth} className={draft.truth === truth ? "active" : ""} onClick={() => setDraft((current) => ({ ...current, truth }))}>{truth}</button>)}</div></div>
                <div className="form-actions"><button type="button" className="randomize-button" onClick={rollResume}>🎲 ROLL A RÉSUMÉ</button><button type="submit" className="open-market-button">OPEN MARKET · 15:00</button></div>
                <p className="form-rule">Only list your own résumé. The joke is on the genre, not the person.</p>
              </form>
              <div className="listing-preview">
                <span className="preview-label">LIVE MARKET PREVIEW</span>
                <div className="preview-card">
                  <div><span>OV-NEW · REFERENCE CHECK</span><span>15:00</span></div>
                  <h3>{draft.title || "Your suspiciously impressive headline appears here"}</h3>
                  <p>ASKING TC <strong>{draft.askingTc || "$350K"}</strong></p>
                  <strong className="preview-odds">50<sup>%</sup></strong>
                  <ProbabilityRail probability={50} />
                  <div className="preview-buttons"><span>YES 50¢</span><span>NO 50¢</span></div>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}

      {modal === "portfolio" && (
        <div className="modal-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setModal(null)}>
          <section className="panel-modal" role="dialog" aria-modal="true" aria-labelledby="portfolio-title">
            <div className="modal-head"><div><span>@MARGIN_GOBLIN</span><h2 id="portfolio-title">Portfolio</h2></div><button onClick={() => setModal(null)}>CLOSE ×</button></div>
            <div className="portfolio-summary"><div><span>AVAILABLE CASH</span><strong>{formatMoney(cash)}</strong></div><div><span>OPEN POSITIONS</span><strong>{Object.values(positions).reduce((sum, item) => sum + item.YES + item.NO, 0)}</strong></div><div><span>RANK</span><strong>#1</strong></div></div>
            <div className="position-table"><div className="table-head"><span>MARKET</span><span>POSITION</span><span>CURRENT</span><span>IF CORRECT</span></div>{Object.entries(positions).map(([marketId, item]) => { const market = markets.find((entry) => entry.id === marketId); if (!market || (!item.YES && !item.NO)) return null; const positionSide = item.YES ? "YES" : "NO"; const count = item.YES || item.NO; const currentPrice = positionSide === "YES" ? market.probability : 100 - market.probability; return <div className="position-row" key={marketId}><span><strong>{marketId}</strong><small>{market.title}</small></span><span className={positionSide === "YES" ? "yes-text" : "no-text"}>{count} {positionSide}</span><span>{currentPrice}¢</span><span>{formatMoney(count * 100)}</span></div>; })}</div>
            <div className="referral-box"><div><span>REFERRAL CREDIT</span><strong>Invite a trader. You both receive $50.00.</strong></div><button onClick={() => { void navigator.clipboard?.writeText("https://overvalued.party/?ref=MARGIN42"); setToast("REFERRAL LINK COPIED"); }}>COPY LINK</button></div>
          </section>
        </div>
      )}

      {modal === "rankings" && (
        <div className="modal-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setModal(null)}>
          <section className="panel-modal rankings-modal" role="dialog" aria-modal="true" aria-labelledby="rankings-title">
            <div className="modal-head"><div><span>LIVE STANDINGS</span><h2 id="rankings-title">Best traders</h2></div><button onClick={() => setModal(null)}>CLOSE ×</button></div>
            <div className="leaderboard-table">{leaderboard.map((player) => <div key={player.rank} className={player.rank === 1 ? "leader" : ""}><span>{String(player.rank).padStart(2, "0")}</span><strong>{player.handle}</strong><span>{player.value}</span><small>{player.move}</small></div>)}</div>
            <div className="award-grid"><article><span>ACTUALLY HIRE THIS PERSON</span><strong>@actually_ships</strong><p>84% room consensus</p></article><article><span>MOST OVERVALUED CANDIDATE</span><strong>Host pick pending</strong><p>A trophy, never a burn.</p></article></div>
          </section>
        </div>
      )}

      {toast && <div className="trade-toast" role="status"><span>✓</span>{toast}</div>}
    </main>
  );
}
