// Portfolio summary: the first screen. Answers in five seconds: total
// value, flags, recent activity, top holdings. Everything else is one
// tap away. Empty state when nothing was ever uploaded.

import { useEffect, useState } from "react";
import { flagSeverity, fmtDate, money, pctUnsigned, totalGain } from "../../lib/portfolio-math";
import type {
  BriefPayload,
  PortfolioPayload,
  PortfolioStore,
} from "../../lib/portfolio-types";
import { FlagList } from "./FlagChip";

interface Props {
  store: PortfolioStore;
  onHolding: (ticker: string) => void;
  onAllocation: () => void;
  onLots: () => void;
  onUpload: () => void;
  onRefresh: () => void;
}

const KIND_LABEL: Record<string, string> = {
  buy: "Bought",
  sell: "Sold",
  trim: "Trimmed",
  close: "Closed",
};

export function SummaryView({
  store,
  onHolding,
  onAllocation,
  onLots,
  onUpload,
  onRefresh,
}: Props) {
  const [brief, setBrief] = useState<BriefPayload | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioPayload | null>(null);
  const [showAllFlagged, setShowAllFlagged] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      const [b, p] = await Promise.all([store.getBrief(), store.getPortfolio()]);
      if (live) {
        setBrief(b);
        setPortfolio(p);
      }
    })();
    return () => {
      live = false;
    };
  }, [store]);

  if (!brief || !portfolio) {
    return <p className="loading">Loading your portfolio…</p>;
  }

  if (portfolio.positions.length === 0 && portfolio.closed.length === 0) {
    return (
      <section className="card" aria-label="Empty portfolio">
        <div className="card-head">
          <h2>No holdings yet</h2>
        </div>
        <p className="card-note">
          Upload a CSV of holdings to start. Columns: ticker, shares, cost
          basis, acquired date. Nothing is stored until you apply the preview.
        </p>
        <div className="pf-actions">
          <button type="button" className="pf-btn-primary" onClick={onUpload}>
            Upload holdings
          </button>
        </div>
      </section>
    );
  }

  const flagged = portfolio.positions
    .filter((p) => p.flags.length > 0)
    .sort((a, b) => {
      const sa = Math.min(...a.flags.map((f) => flagSeverity(f.kind)));
      const sb = Math.min(...b.flags.map((f) => flagSeverity(f.kind)));
      return sa - sb || (a.ticker < b.ticker ? -1 : a.ticker > b.ticker ? 1 : 0);
    });
  const visibleFlagged = showAllFlagged ? flagged : flagged.slice(0, 5);
  const heroGain = totalGain(portfolio.positions);
  const heroExcludesMissingBasis = portfolio.positions.filter((p) =>
    p.flags.some((f) => f.kind === "missing-basis"),
  ).length;

  return (
    <>
      {portfolio.pricesStale && portfolio.pricesAsOf && (
        <button
          type="button"
          className="pf-banner pf-banner-action"
          onClick={onRefresh}
        >
          Prices are stale. Last refresh {fmtDate(portfolio.pricesAsOf)}. Tap
          to refresh.
        </button>
      )}
      {portfolio.pricesStale && !portfolio.pricesAsOf && (
        <button
          type="button"
          className="pf-banner pf-banner-action"
          onClick={onRefresh}
        >
          No prices yet. Tap to refresh.
        </button>
      )}
      {portfolio.holdingsStale && portfolio.holdingsAsOf && (
        <button
          type="button"
          className="pf-banner pf-banner-action"
          onClick={onUpload}
        >
          Holdings are stale. Last upload {fmtDate(portfolio.holdingsAsOf)}.
          Tap to upload a fresh CSV.
        </button>
      )}

      <section className="card" aria-label="Portfolio total">
        <div className="card-head">
          <h2>Portfolio</h2>
          <span className="pf-asof">v{brief.version}</span>
        </div>
        <p className="pf-hero">{money(brief.totalValue)}</p>
        {heroGain !== null && (
          <p className="pf-hero-delta">
            {heroGain > 0
              ? `+${money(heroGain)} unrealized gain`
              : heroGain < 0
                ? `${money(heroGain)} unrealized loss`
                : "No unrealized gain or loss"}
            {heroExcludesMissingBasis > 0
              ? ` (excludes ${heroExcludesMissingBasis} holding${heroExcludesMissingBasis === 1 ? "" : "s"} with missing basis)`
              : ""}
          </p>
        )}
        <p className="card-note">
          {brief.positionCount} holdings
          {brief.holdingsAsOf ? ` · holdings as of ${fmtDate(brief.holdingsAsOf)}` : ""}
          {brief.pricesAsOf ? ` · prices as of ${fmtDate(brief.pricesAsOf)}` : ""}
        </p>
      </section>

      {flagged.length > 0 && (
        <section className="card" aria-label="Flags">
          <div className="card-head">
            <h2>Flags</h2>
          </div>
          <div className="pf-rows">
            {visibleFlagged.map((p) => (
              <div key={p.ticker} className="pf-item">
                <button
                  type="button"
                  className="pf-row"
                  onClick={() => onHolding(p.ticker)}
                  aria-label={`${p.ticker} holding detail`}
                >
                  <span className="pf-row-main">
                    <strong>{p.ticker}</strong>
                    <span className="pf-row-sub">{p.name}</span>
                  </span>
                </button>
                <FlagList flags={p.flags} />
              </div>
            ))}
          </div>
          {flagged.length > 5 && (
            <div className="pf-actions">
              <button
                type="button"
                className="pf-btn"
                onClick={() => setShowAllFlagged((v) => !v)}
              >
                {showAllFlagged
                  ? "Show fewer"
                  : `See all ${flagged.length} flagged`}
              </button>
            </div>
          )}
        </section>
      )}

      {brief.recentActivity.length > 0 && (
        <section className="card" aria-label="Recent activity">
          <div className="card-head">
            <h2>Recent activity</h2>
          </div>
          <div className="pf-rows">
            {brief.recentActivity.map((e) => (
              <button
                key={e.id}
                type="button"
                className="pf-row"
                onClick={() => onHolding(e.ticker)}
              >
                <span className="pf-row-main">
                  <strong>
                    {KIND_LABEL[e.kind] ?? e.kind} {e.ticker}
                  </strong>
                  <span className="pf-row-sub">{e.note}</span>
                </span>
                <span className="pf-row-right">
                  <span>{e.shares} sh</span>
                  <span className="pf-row-sub">{fmtDate(e.date)}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="card" aria-label="Top holdings">
        <div className="card-head">
          <h2>Top holdings</h2>
        </div>
        <div className="pf-rows">
          {brief.topHoldings.map((h) => (
            <button
              key={h.ticker}
              type="button"
              className="pf-row"
              onClick={() => onHolding(h.ticker)}
            >
              <span className="pf-row-main">
                <strong>{h.ticker}</strong>
              </span>
              <span className="pf-row-right">
                <span>{money(h.value)}</span>
                <span className="pf-row-sub">{pctUnsigned(h.pct)} of portfolio</span>
              </span>
            </button>
          ))}
        </div>
        <div className="pf-actions">
          <button type="button" className="pf-btn" onClick={onAllocation}>
            Allocation
          </button>
          <button type="button" className="pf-btn" onClick={onLots}>
            All tax lots
          </button>
        </div>
      </section>

      {portfolio.closed.length > 0 && (
        <section className="card" aria-label="Recently closed">
          <div className="card-head">
            <h2>Recently closed</h2>
          </div>
          <div className="pf-rows">
            {portfolio.closed.map((p) => (
              <div key={p.ticker} className="pf-item">
                <button
                  type="button"
                  className="pf-row"
                  onClick={() => onHolding(p.ticker)}
                  aria-label={`${p.ticker} holding detail`}
                >
                  <span className="pf-row-main">
                    <strong>{p.ticker}</strong>
                    <span className="pf-row-sub">{p.name}</span>
                  </span>
                </button>
                <FlagList flags={p.flags} />
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="pf-actions pf-actions-bottom">
        <button type="button" className="pf-btn-primary" onClick={onUpload}>
          Upload holdings
        </button>
        <button type="button" className="pf-btn" onClick={onRefresh}>
          Refresh prices
        </button>
      </div>
    </>
  );
}
