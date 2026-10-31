import { useEffect, useMemo, useRef, useState } from "react";
import { FineTune } from "./components/FineTune";
import { HeroInputs } from "./components/HeroInputs";
import { MoneyFlow } from "./components/MoneyFlow";
import { ScenarioBars } from "./components/ScenarioBars";
import { Timeline } from "./components/Timeline";
import { TopBar } from "./components/TopBar";
import { PortfolioApp } from "./components/portfolio/PortfolioApp";
import { Verdict } from "./components/Verdict";
import { fetchAssumptions, fetchDefaults, saveAssumptions } from "./lib/api";
import {
  buildTimeline,
  compute,
  moneyFlow,
  scenarioResults,
} from "./lib/calc";
import {
  NUMERIC_KEYS,
  ZERO_ASSUMPTIONS,
  type Assumptions,
  type SeededDefaults,
} from "./lib/types";

type SaveState = "idle" | "saving" | "saved" | "error";

const STATUS_TEXT: Record<SaveState, string> = {
  idle: "",
  saving: "Saving…",
  saved: "Saved",
  error: "Save failed",
};

const SCENARIO_ORDER = ["daycare", "nanny", "none"];

function pickAssumptions(d: SeededDefaults): Assumptions {
  const { movers: _movers, childcareOptions: _opts, ...rest } = d;
  return rest;
}

export function App() {
  const [seeded, setSeeded] = useState<SeededDefaults | null>(null);
  const [assumptions, setAssumptions] = useState<Assumptions>(ZERO_ASSUMPTIONS);
  const [ready, setReady] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [phase, setPhase] = useState<1 | 2>(2);
  // Top-level section tab, using the app's existing .seg pattern (same as
  // the Phase toggle in MoneyFlow). Cash flow is the existing dashboard;
  // Portfolio is the new section.
  const [tab, setTab] = useState<"cashflow" | "portfolio">("cashflow");
  // Snapshot of the last saved levers. The save effect only persists when
  // the levers differ from this snapshot, so the initial load never
  // triggers a save (or a spurious failure when the API is unreachable,
  // as under `npm run dev`). This also survives React StrictMode's
  // double effect run in dev, which consumed the old skip-once flag and
  // produced a "Save failed" status before any user edit.
  const lastSaved = useRef<string | null>(null);

  useEffect(() => {
    (async () => {
      const [d, saved] = await Promise.all([fetchDefaults(), fetchAssumptions()]);
      const base = d ? pickAssumptions(d) : ZERO_ASSUMPTIONS;
      const merged: Assumptions = { ...base };
      for (const k of NUMERIC_KEYS) {
        if (typeof saved[k] === "number") merged[k] = saved[k] as never;
      }
      if (typeof saved.includeBonus === "boolean") merged.includeBonus = saved.includeBonus;
      if (typeof saved.childcare === "string" && saved.childcare) merged.childcare = saved.childcare;
      if (typeof saved.startMonth === "string") merged.startMonth = saved.startMonth;
      lastSaved.current = JSON.stringify(merged);
      setSeeded(d);
      setAssumptions(merged);
      setReady(true);
    })();
  }, []);

  // Debounced persist on lever changes, only when they differ from the
  // last saved snapshot.
  useEffect(() => {
    if (!ready) return;
    const snapshot = JSON.stringify(assumptions);
    if (lastSaved.current === snapshot) return;
    setSaveState("saving");
    const t = window.setTimeout(async () => {
      const ok = await saveAssumptions(assumptions);
      if (ok) lastSaved.current = snapshot;
      setSaveState(ok ? "saved" : "error");
    }, 600);
    return () => window.clearTimeout(t);
  }, [assumptions, ready]);

  const patch = (p: Partial<Assumptions>) =>
    setAssumptions((prev) => ({ ...prev, ...p }));

  const reset = async () => {
    if (!seeded) return;
    const base = pickAssumptions(seeded);
    lastSaved.current = JSON.stringify(base);
    setAssumptions(base);
    setSaveState("saving");
    setSaveState((await saveAssumptions(base)) ? "saved" : "error");
  };

  const options = seeded?.childcareOptions ?? [];
  const movers = seeded?.movers ?? 0;

  const calc = useMemo(
    () => compute(assumptions, movers, options),
    [assumptions, movers, options],
  );
  const flow = useMemo(
    () => moneyFlow(assumptions, options, phase),
    [assumptions, options, phase],
  );
  const scenarios = useMemo(
    () => scenarioResults(assumptions, movers, options, SCENARIO_ORDER),
    [assumptions, movers, options],
  );
  const { points, babyOffset, birthOffset } = useMemo(
    () => buildTimeline(assumptions, movers, options),
    [assumptions, movers, options],
  );

  return (
    <main className="dash">
      <TopBar status={STATUS_TEXT[saveState]} onReset={reset} />

      <div className="pf-tabstrip">
        <div className="seg" role="tablist" aria-label="Section">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "cashflow"}
            className={tab === "cashflow" ? "on" : ""}
            onClick={() => setTab("cashflow")}
          >
            Cash flow
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "portfolio"}
            className={tab === "portfolio" ? "on" : ""}
            onClick={() => setTab("portfolio")}
          >
            Portfolio
          </button>
        </div>
      </div>

      {tab === "portfolio" ? (
        <PortfolioApp />
      ) : !ready ? (
        <p className="loading">Loading your assumptions…</p>
      ) : (
        <>
          {!seeded && (
            <p className="seed-notice" role="status">
              No seeded defaults found yet. Showing a blank slate; the owner can
              seed defaults with <code>npm run seed</code>.
            </p>
          )}
          <Verdict
            rent={assumptions.rent}
            childcareId={assumptions.childcare}
            total={phase === 1 ? calc.phase1.total : calc.phase2.total}
            includeBonus={assumptions.includeBonus}
            phase={phase}
          />
          <MoneyFlow
            nodes={flow.nodes}
            links={flow.links}
            phase={phase}
            onPhase={setPhase}
            includeBonus={assumptions.includeBonus}
          />
          <ScenarioBars scenarios={scenarios} selectedId={assumptions.childcare} />
          <Timeline points={points} babyOffset={babyOffset} birthOffset={birthOffset} />
          <HeroInputs a={assumptions} options={options} onPatch={patch} />
          <FineTune
            a={assumptions}
            onPatch={patch}
            oneTime={{
              broker: calc.broker,
              movers,
              medical: calc.medical,
              total: calc.oneTimeTotal,
            }}
          />

          <section className="notes">
            <details>
              <summary>Sources, definitions, and caveats</summary>
              <div className="notes-grid">
                <div>
                  <h3>Household data</h3>
                  <p>
                    Income and spending defaults come from the Rocket Money CSV
                    export reconciled by the assistant. To refresh the data,
                    hand a new CSV export to the assistant, who re-runs the
                    reconciliation and re-seeds the defaults. The app itself
                    never parses CSVs.
                  </p>
                </div>
                <div>
                  <h3>Baby planning</h3>
                  <p>
                    Childcare figures are Brooklyn planning estimates; the
                    informal aunty market has thin data. Medical out-of-pocket
                    cost is a planning reserve, not a benefit determination.
                  </p>
                </div>
                <div>
                  <h3>How investing is calculated</h3>
                  <p>
                    Cash-flow investing equals monthly take-home minus recurring
                    costs. Total investing adds the annual bonus net divided by
                    12 when the bonus toggle is on. One-time reserves are shown
                    separately and do not reduce either monthly figure.
                  </p>
                </div>
              </div>
            </details>
            <p className="fine-print">
              Planning model only. Changes save to your private store automatically.
            </p>
          </section>
        </>
      )}
    </main>
  );
}
