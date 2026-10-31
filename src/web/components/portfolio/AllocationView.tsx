// Allocation view, CSI style: group by sector or supply chain, weighting
// by company or by value. Tapping a group drills into its holdings.

import { useEffect, useState } from "react";
import { money, pctUnsigned } from "../../lib/portfolio-math";
import type {
  AllocationPayload,
  PortfolioPayload,
  PortfolioStore,
} from "../../lib/portfolio-types";
import { FlagList } from "./FlagChip";

interface Props {
  store: PortfolioStore;
  onHolding: (ticker: string) => void;
}

export function AllocationView({ store, onHolding }: Props) {
  const [groupBy, setGroupBy] = useState<"sector" | "supplyChain">("sector");
  const [weighting, setWeighting] = useState<"company" | "value">("value");
  const [data, setData] = useState<AllocationPayload | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioPayload | null>(null);
  const [group, setGroup] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      const [a, p] = await Promise.all([
        store.getAllocation(groupBy, weighting),
        store.getPortfolio(),
      ]);
      if (live) {
        setData(a);
        setPortfolio(p);
      }
    })();
    return () => {
      live = false;
    };
  }, [store, groupBy, weighting]);

  if (!data || !portfolio) {
    return <p className="loading">Loading allocation…</p>;
  }

  if (data.groups.length === 0) {
    return (
      <section className="card" aria-label="Empty allocation">
        <div className="card-head">
          <h2>Allocation</h2>
        </div>
        <p className="card-note">
          No holdings yet. Upload a CSV to see the allocation.
        </p>
      </section>
    );
  }

  if (group !== null) {
    const g = data.groups.find((x) => x.key === group);
    const members = g
      ? portfolio.positions
          .filter((p) => g.tickers.includes(p.ticker))
          .sort((a, b) => b.value - a.value)
      : [];
    return (
      <section className="card" aria-label={`Holdings in ${group}`}>
        <div className="card-head">
          <h2>{group}</h2>
          <button type="button" className="link-btn" onClick={() => setGroup(null)}>
            All groups
          </button>
        </div>
        <div className="pf-rows">
          {members.map((p) => (
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
                <span className="pf-row-right">
                  <span>{money(p.value)}</span>
                  <span className="pf-row-sub">
                    {data.totalValue > 0
                      ? `${pctUnsigned(p.value / data.totalValue)} of portfolio`
                      : "—"}
                  </span>
                </span>
              </button>
              <FlagList flags={p.flags} />
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="card" aria-label="Allocation">
      <div className="card-head">
        <h2>Allocation</h2>
      </div>
      <div className="pf-seg-row">
        <div className="seg" role="group" aria-label="Group by">
          <button
            type="button"
            className={groupBy === "sector" ? "on" : ""}
            onClick={() => setGroupBy("sector")}
            aria-pressed={groupBy === "sector"}
          >
            Sector
          </button>
          <button
            type="button"
            className={groupBy === "supplyChain" ? "on" : ""}
            onClick={() => setGroupBy("supplyChain")}
            aria-pressed={groupBy === "supplyChain"}
          >
            Supply chain
          </button>
        </div>
        <div className="seg" role="group" aria-label="Weighting">
          <button
            type="button"
            className={weighting === "value" ? "on" : ""}
            onClick={() => setWeighting("value")}
            aria-pressed={weighting === "value"}
          >
            By value
          </button>
          <button
            type="button"
            className={weighting === "company" ? "on" : ""}
            onClick={() => setWeighting("company")}
            aria-pressed={weighting === "company"}
          >
            By company
          </button>
        </div>
      </div>
      <div className="pf-rows">
        {data.groups.map((g) => (
          <button
            key={g.key}
            type="button"
            className="pf-row"
            onClick={() => setGroup(g.key)}
          >
            <span className="pf-row-main">
              <strong>{g.label}</strong>
              <span className="pf-row-sub">
                {weighting === "value"
                  ? `${g.companies} ${g.companies === 1 ? "company" : "companies"}`
                  : money(g.value)}
              </span>
            </span>
            <span className="pf-row-right">
              <span>{weighting === "value" ? money(g.value) : `${g.companies}`}</span>
              <span className="pf-row-sub">
                {pctUnsigned(g.pct)}
                {weighting === "value" ? " of portfolio" : " of companies"}
              </span>
            </span>
          </button>
        ))}
      </div>
      <p className="card-note">
        Total {money(data.totalValue)} across {portfolio.positions.length} holdings.
      </p>
    </section>
  );
}
