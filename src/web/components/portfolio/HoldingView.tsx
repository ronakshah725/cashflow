// Holding detail: header numbers, flags, drawdowns by window, then the
// tax lots. Tapping a lot drills into lot detail.

import { useEffect, useState } from "react";
import { fmtDate, money, pct, WINDOW_LABELS } from "../../lib/portfolio-math";
import type {
  DrawdownsPayload,
  LotsPayload,
  PortfolioPayload,
  PortfolioStore,
} from "../../lib/portfolio-types";
import { FlagList } from "./FlagChip";

interface Props {
  store: PortfolioStore;
  ticker: string;
  onLot: (lotId: string) => void;
}

export function HoldingView({ store, ticker, onLot }: Props) {
  const [portfolio, setPortfolio] = useState<PortfolioPayload | null>(null);
  const [lots, setLots] = useState<LotsPayload | null>(null);
  const [drawdowns, setDrawdowns] = useState<DrawdownsPayload | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      const [p, l, d] = await Promise.all([
        store.getPortfolio(),
        store.getLots(ticker),
        store.getDrawdowns(),
      ]);
      if (live) {
        setPortfolio(p);
        setLots(l);
        setDrawdowns(d);
      }
    })();
    return () => {
      live = false;
    };
  }, [store, ticker]);

  if (!portfolio || !lots || !drawdowns) {
    return <p className="loading">Loading holding…</p>;
  }

  const position =
    portfolio.positions.find((p) => p.ticker === ticker) ??
    portfolio.closed.find((p) => p.ticker === ticker);
  if (!position) {
    return (
      <section className="card" aria-label="Holding not found">
        <div className="card-head">
          <h2>{ticker} not found</h2>
        </div>
        <p className="card-note">This holding is not in the current portfolio.</p>
      </section>
    );
  }

  const dd = drawdowns.holdings.find((h) => h.ticker === ticker);
  const sale = portfolio.activity.find(
    (e) => e.ticker === ticker && (e.kind === "sell" || e.kind === "close"),
  );

  return (
    <>
      <section className="card" aria-label={`${ticker} summary`}>
        <div className="card-head">
          <h2>
            {position.ticker} · {position.name}
          </h2>
        </div>
        {position.shares === 0 ? (
          <p className="card-note">
            Closed position. No shares held.
            {sale ? ` Last sale ${fmtDate(sale.date)}.` : ""}
          </p>
        ) : (
          <>
            <p className="pf-hero">{money(position.value)}</p>
            <p className="card-note">
              {position.shares} shares
              {position.price !== null ? ` · ${money(position.price)} per share` : " · no price"}
              {position.priceAsOf ? ` · price as of ${fmtDate(position.priceAsOf)}` : ""}
              {position.gain !== null
                ? ` · unrealized ${position.gain < 0 ? "loss" : "gain"} ${money(Math.abs(position.gain))}`
                : ""}
            </p>
            <p className="card-note">
              {position.sector} · {position.supplyChain}
            </p>
          </>
        )}
        <div className="pf-flags-block">
          <FlagList flags={position.flags} />
        </div>
      </section>

      {dd && (
        <section className="card" aria-label="Drawdowns from peak">
          <div className="card-head">
            <h2>Drawdown from peak</h2>
          </div>
          <div className="pf-rows">
            {drawdowns.windows.map((w) => {
              const d = dd.drawdowns[w];
              return (
                <div key={w} className="pf-row pf-row-static">
                  <span className="pf-row-main">
                    <strong>{WINDOW_LABELS[w]}</strong>
                    <span className="pf-row-sub">
                      {d ? `Peak ${fmtDate(d.peakDate)}` : "No peak data"}
                    </span>
                  </span>
                  <span className="pf-row-right">
                    <span>{d ? pct(d.pct) : "—"}</span>
                  </span>
                </div>
              );
            })}
          </div>
          <p className="card-note">
            Drawdowns use adjusted closes, so splits never read as crashes.
          </p>
        </section>
      )}

      <section className="card" aria-label="Tax lots">
        <div className="card-head">
          <h2>Tax lots</h2>
        </div>
        {lots.lots.length === 0 ? (
          <p className="card-note">
            No lots on file for this holding. Lots arrive with the upload CSV.
          </p>
        ) : (
          <div className="pf-rows">
            {lots.lots.map((l) => (
              <div key={l.id} className="pf-item">
                <button
                  type="button"
                  className="pf-row"
                  onClick={() => onLot(l.id)}
                  aria-label={`Lot detail for ${l.ticker}`}
                >
                  <span className="pf-row-main">
                    <strong>{l.shares} shares</strong>
                    <span className="pf-row-sub">
                      Acquired {l.acquiredDate ? fmtDate(l.acquiredDate) : "date unknown"}
                      {l.costBasis !== null ? ` · basis ${money(l.costBasis)}/sh` : " · basis unknown"}
                    </span>
                  </span>
                  <span className="pf-row-right">
                    <span>
                      {l.gain === null
                        ? "—"
                        : `${l.gain < 0 ? "Loss " : "Gain "}${money(Math.abs(l.gain))}`}
                    </span>
                    <span className="pf-row-sub">
                      {l.term === "unknown" ? "term unknown" : `${l.term}-term`}
                    </span>
                  </span>
                </button>
                <FlagList flags={l.flags} />
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
