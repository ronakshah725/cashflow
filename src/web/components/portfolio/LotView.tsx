// Lot detail: one tax lot, fully explained. Tax math here is an
// estimate, not tax advice.

import { useEffect, useState } from "react";
import { fmtDate, money } from "../../lib/portfolio-math";
import type { LotsPayload, PortfolioStore } from "../../lib/portfolio-types";
import { FlagList } from "./FlagChip";

interface Props {
  store: PortfolioStore;
  lotId: string;
}

export function LotView({ store, lotId }: Props) {
  const [lots, setLots] = useState<LotsPayload | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      const data = await store.getLots();
      if (live) setLots(data);
    })();
    return () => {
      live = false;
    };
  }, [store]);

  if (!lots) {
    return <p className="loading">Loading lot…</p>;
  }

  const lot = lots.lots.find((l) => l.id === lotId);
  if (!lot) {
    return (
      <section className="card" aria-label="Lot not found">
        <div className="card-head">
          <h2>Lot not found</h2>
        </div>
        <p className="card-note">This lot is not in the current portfolio.</p>
      </section>
    );
  }

  return (
    <section className="card" aria-label={`Lot ${lot.ticker}`}>
      <div className="card-head">
        <h2>
          {lot.ticker} · {lot.shares} shares
        </h2>
      </div>
      <div className="pf-rows">
        <div className="pf-row pf-row-static">
          <span className="pf-row-main">
            <strong>Acquired</strong>
          </span>
          <span className="pf-row-right">
            <span>{lot.acquiredDate ? fmtDate(lot.acquiredDate) : "Unknown"}</span>
            <span className="pf-row-sub">
              {lot.daysHeld !== null ? `${lot.daysHeld} days held` : ""}
            </span>
          </span>
        </div>
        <div className="pf-row pf-row-static">
          <span className="pf-row-main">
            <strong>Cost basis</strong>
          </span>
          <span className="pf-row-right">
            <span>
              {lot.costBasis !== null ? `${money(lot.costBasis)}/sh` : "Unknown"}
            </span>
            <span className="pf-row-sub">
              {lot.costBasis !== null ? `Total ${money(lot.costBasis * lot.shares)}` : ""}
            </span>
          </span>
        </div>
        <div className="pf-row pf-row-static">
          <span className="pf-row-main">
            <strong>Current price</strong>
          </span>
          <span className="pf-row-right">
            <span>{lot.currentPrice !== null ? money(lot.currentPrice) : "No price"}</span>
            <span className="pf-row-sub">
              {lot.currentValue !== null ? `Value ${money(lot.currentValue)}` : ""}
            </span>
          </span>
        </div>
        <div className="pf-row pf-row-static">
          <span className="pf-row-main">
            <strong>Unrealized {lot.gain !== null && lot.gain < 0 ? "loss" : "gain"}</strong>
          </span>
          <span className="pf-row-right">
            <span>{lot.gain !== null ? money(Math.abs(lot.gain)) : "Cannot compute"}</span>
            <span className="pf-row-sub">
              {lot.term === "unknown" ? "term unknown" : `${lot.term}-term`}
            </span>
          </span>
        </div>
      </div>
      <div className="pf-flags-block">
        <FlagList flags={lot.flags} />
      </div>
      <p className="card-note">
        Tax math is an estimate, not tax advice. A CPA decides filing.
      </p>
    </section>
  );
}
