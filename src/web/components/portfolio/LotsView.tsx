// All tax lots across the portfolio, with filters for the questions a
// long-term investor actually asks: what is at a loss, and what can be
// harvested.

import { useEffect, useState } from "react";
import { fmtDate, money } from "../../lib/portfolio-math";
import type { LotsPayload, PortfolioStore } from "../../lib/portfolio-types";
import { FlagList } from "./FlagChip";

interface Props {
  store: PortfolioStore;
  onLot: (lotId: string) => void;
}

type Filter = "all" | "losses" | "short" | "long" | "harvestable";

export function LotsView({ store, onLot }: Props) {
  const [data, setData] = useState<LotsPayload | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    let live = true;
    (async () => {
      const d = await store.getLots();
      if (live) setData(d);
    })();
    return () => {
      live = false;
    };
  }, [store]);

  if (!data) {
    return <p className="loading">Loading tax lots…</p>;
  }

  const filtered = data.lots.filter((l) => {
    switch (filter) {
      case "losses":
        return l.gain !== null && l.gain < 0;
      case "short":
        return l.term === "short";
      case "long":
        return l.term === "long";
      case "harvestable":
        return l.gain !== null && l.gain < 0;
      default:
        return true;
    }
  });
  // Losses view ranks harvest candidates worst first, so the biggest
  // loss is the first row, not the last lot in store order.
  if (filter === "losses") {
    filtered.sort((a, b) => (a.gain ?? 0) - (b.gain ?? 0));
  }

  return (
    <section className="card" aria-label="All tax lots">
      <div className="card-head">
        <h2>Tax lots</h2>
      </div>
      {filter === "losses" && (
        <p className="card-note">
          Short-term losses offset short-term gains first, and long-term
          losses offset long-term gains first. Harvesting only helps
          against realized gains or limited income.
        </p>
      )}
      <div className="pf-seg-row">
        <div className="seg" role="group" aria-label="Lot filter">
          {(
            [
              ["all", "All"],
              ["losses", "Losses"],
              ["short", "Short-term"],
              ["long", "Long-term"],
            ] as [Filter, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={filter === id ? "on" : ""}
              onClick={() => setFilter(id)}
              aria-pressed={filter === id}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {filtered.length === 0 ? (
        <p className="card-note">
          No lots match this filter.
          {data.lots.length === 0
            ? " Upload a CSV to add lots."
            : ""}
        </p>
      ) : (
        <div className="pf-rows">
          {filtered.map((l) => (
            <div key={l.id} className="pf-item">
              <button
                type="button"
                className="pf-row"
                onClick={() => onLot(l.id)}
                aria-label={`Lot detail for ${l.ticker}`}
              >
                <span className="pf-row-main">
                  <strong>
                    {l.ticker} · {l.shares} sh
                  </strong>
                  <span className="pf-row-sub">
                    Acquired {l.acquiredDate ? fmtDate(l.acquiredDate) : "date unknown"}
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
  );
}
