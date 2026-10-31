// Portfolio shell. Owns the view stack and the store wiring point.
//
// PROTOTYPE WIRING: the store here is the in-memory mock. When the real
// Worker backend lands, this file swaps `new MockPortfolioStore(...)`
// for the fetch-based store and nothing else changes: every view below
// only talks to the PortfolioStore interface.

import { useEffect, useState } from "react";
import { MockPortfolioStore, mockStateFromUrl } from "../../lib/portfolio-mock";
import type { PortfolioStore } from "../../lib/portfolio-types";
import "./portfolio.css";
import { AllocationView } from "./AllocationView";
import { HoldingView } from "./HoldingView";
import { LotView } from "./LotView";
import { LotsView } from "./LotsView";
import { SummaryView } from "./SummaryView";
import { UploadView } from "./UploadView";

type View =
  | { name: "summary" }
  | { name: "allocation" }
  | { name: "holding"; ticker: string }
  | { name: "lots" }
  | { name: "lot"; lotId: string }
  | { name: "upload" };

export function PortfolioApp() {
  const [store] = useState<PortfolioStore>(
    () => new MockPortfolioStore(mockStateFromUrl(window.location.search)),
  );
  const [bootLoading] = useState(
    () => new URLSearchParams(window.location.search).get("portfolioState") === "loading",
  );
  const [booted, setBooted] = useState(!bootLoading);
  const [stack, setStack] = useState<View[]>([{ name: "summary" }]);
  const [viewKey, setViewKey] = useState(0);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!booted) {
      const t = window.setTimeout(() => setBooted(true), 1400);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [booted]);

  const push = (view: View) => {
    setNotice("");
    setStack((s) => [...s, view]);
  };
  const back = () => {
    setNotice("");
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  };
  const home = () => {
    setStack([{ name: "summary" }]);
  };

  if (!booted) {
    return (
      <>
        <div className="pf-skeleton" aria-label="Loading" />
        <div className="pf-skeleton" aria-label="Loading" />
        <div className="pf-skeleton" aria-label="Loading" />
      </>
    );
  }

  const view = stack[stack.length - 1];

  return (
    <>
      <div className="pf-head">
        <div>
          <h1 className="pf-title">Portfolio</h1>
          <p className="pf-subtitle">Sample data — not real holdings</p>
        </div>
        {stack.length > 1 && (
          <button type="button" className="pf-btn" onClick={back}>
            Back
          </button>
        )}
      </div>

      {notice && (
        <p className="pf-banner" role="status">
          {notice}
        </p>
      )}

      <div key={viewKey}>
        {view.name === "summary" && (
          <SummaryView
            store={store}
            onHolding={(ticker) => push({ name: "holding", ticker })}
            onAllocation={() => push({ name: "allocation" })}
            onLots={() => push({ name: "lots" })}
            onUpload={() => push({ name: "upload" })}
            onRefresh={async () => {
              await store.refreshPrices();
              setViewKey((k) => k + 1);
              setNotice("Prices refreshed in this demo.");
            }}
          />
        )}
        {view.name === "allocation" && (
          <AllocationView
            store={store}
            onHolding={(ticker) => push({ name: "holding", ticker })}
          />
        )}
        {view.name === "holding" && (
          <HoldingView
            store={store}
            ticker={view.ticker}
            onLot={(lotId) => push({ name: "lot", lotId })}
          />
        )}
        {view.name === "lots" && (
          <LotsView store={store} onLot={(lotId) => push({ name: "lot", lotId })} />
        )}
        {view.name === "lot" && <LotView store={store} lotId={view.lotId} />}
        {view.name === "upload" && (
          <UploadView
            store={store}
            onApplied={() => {
              home();
              setNotice("Upload applied to this demo.");
            }}
          />
        )}
      </div>
    </>
  );
}
