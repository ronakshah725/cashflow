// Upload with diff preview. Paste or drop a CSV, see exactly what
// changes (added, removed, changed lots) before anything applies. A
// parse error blocks apply. In this prototype, applying updates only
// the in-memory demo store; the real app saves to the private store.

import { useEffect, useState } from "react";
import { fmtDate, money } from "../../lib/portfolio-math";
import type {
  LotsPayload,
  PortfolioStore,
  UploadDiff,
} from "../../lib/portfolio-types";

interface Props {
  store: PortfolioStore;
  onApplied: () => void;
}

function lotsToCsv(lots: LotsPayload["lots"]): string {
  const lines = ["ticker,shares,costBasis,acquiredDate"];
  for (const l of lots) {
    lines.push(
      `${l.ticker},${l.shares},${l.costBasis === null ? "" : l.costBasis},${l.acquiredDate}`,
    );
  }
  return lines.join("\n");
}

/** Demo CSV: the current lots, plus one added lot, one changed lot, and
 *  one removed lot, so every diff section shows something. */
function demoCsv(lots: LotsPayload["lots"]): string {
  const rows = lotsToCsv(lots).split("\n");
  const header = rows[0];
  const body = rows.slice(1);
  const changed = body.map((line) => {
    const cells = line.split(",");
    if (cells[0] === "ZEPH") cells[1] = "250";
    return cells.join(",");
  });
  const kept = changed.filter((line) => !line.startsWith("EMBR,"));
  return [header, ...kept, "NOVA,50,195,2026-10-29"].join("\n");
}

export function UploadView({ store, onApplied }: Props) {
  const [csv, setCsv] = useState("");
  const [lots, setLots] = useState<LotsPayload | null>(null);
  const [diff, setDiff] = useState<UploadDiff | null>(null);
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      const d = await store.getLots();
      if (live) setLots(d);
    })();
    return () => {
      live = false;
    };
  }, [store]);

  // Preview is async-shaped (the real backend POSTs the CSV), so the
  // diff resolves through state, not a synchronous memo.
  useEffect(() => {
    if (!csv.trim()) {
      setDiff(null);
      return;
    }
    let live = true;
    store.previewUpload(csv).then((d) => {
      if (live) setDiff(d);
    });
    return () => {
      live = false;
    };
  }, [csv, store]);

  const changeCount = diff
    ? diff.added.length + diff.removed.length + diff.changed.length
    : 0;

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setCsv(await file.text());
    setApplied(false);
  };

  const apply = async () => {
    if (!diff || !diff.ok || changeCount === 0) return;
    await store.applyUpload(diff);
    setApplied(true);
    onApplied();
  };

  const download = (filename: string, text: string, type: string) => {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <section className="card" aria-label="Upload holdings CSV">
        <div className="card-head">
          <h2>Upload holdings</h2>
        </div>
        <p className="card-note">
          Columns: ticker, shares, cost basis, acquired date. This CSV is a
          full snapshot: lots missing from it count as removed. Nothing
          applies until you confirm the preview below.
        </p>
        <label className="pf-field-label" htmlFor="pf-csv">
          Paste CSV
        </label>
        <textarea
          id="pf-csv"
          className="pf-textarea"
          rows={8}
          value={csv}
          placeholder={"ticker,shares,costBasis,acquiredDate\nNOVA,120,180,2026-10-20"}
          onChange={(e) => {
            setCsv(e.target.value);
            setApplied(false);
          }}
        />
        <div className="pf-actions">
          <label className="pf-btn pf-file-label">
            Choose file
            <input
              type="file"
              accept=".csv,text/csv"
              className="pf-file-input"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
          </label>
          <button
            type="button"
            className="pf-btn"
            disabled={!lots}
            onClick={() => {
              if (lots) {
                setCsv(demoCsv(lots.lots));
                setApplied(false);
              }
            }}
          >
            Load demo CSV
          </button>
        </div>
      </section>

      <section className="card" aria-label="Export lots">
        <div className="card-head">
          <h2>Export</h2>
        </div>
        <p className="card-note">
          Download the current lots any time. The CSV uses the same columns
          as upload, so an export round-trips back through the preview.
        </p>
        <div className="pf-actions">
          <button
            type="button"
            className="pf-btn"
            disabled={!lots}
            onClick={() => {
              if (lots) {
                download(
                  "portfolio-lots.json",
                  JSON.stringify(lots.lots, null, 2),
                  "application/json",
                );
              }
            }}
          >
            Download JSON
          </button>
          <button
            type="button"
            className="pf-btn"
            disabled={!lots}
            onClick={() => {
              if (lots) {
                download("portfolio-lots.csv", lotsToCsv(lots.lots), "text/csv");
              }
            }}
          >
            Download CSV
          </button>
        </div>
      </section>

      {applied && (
        <p className="pf-banner" role="status">
          Upload applied to this demo. Reload the page to reset the sample.
        </p>
      )}

      {diff && (
        <section className="card" aria-label="Upload preview">
          <div className="card-head">
            <h2>Preview</h2>
          </div>
          {diff.errors.length > 0 ? (
            <div>
              <p className="card-note">
                Fix these rows before applying. Nothing has changed.
              </p>
              <ul className="pf-list">
                {diff.errors.map((e, i) => (
                  <li key={i}>
                    Line {e.line}: {e.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : changeCount === 0 ? (
            <p className="card-note">
              No changes. Every lot in the CSV already matches the portfolio.
            </p>
          ) : (
            <>
              {diff.added.length > 0 && (
                <div className="pf-diff-group">
                  <h3>Added ({diff.added.length})</h3>
                  <ul className="pf-list">
                    {diff.added.map((r, i) => (
                      <li key={i}>
                        {r.ticker} · {r.shares} sh
                        {r.costBasis !== null ? ` · basis ${money(r.costBasis)}/sh` : " · basis unknown"}
                        {r.acquiredDate ? ` · ${fmtDate(r.acquiredDate)}` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {diff.changed.length > 0 && (
                <div className="pf-diff-group">
                  <h3>Changed ({diff.changed.length})</h3>
                  <ul className="pf-list">
                    {diff.changed.map((c, i) => {
                      const parts: string[] = [];
                      if (c.before.shares !== c.after.shares) {
                        parts.push(`${c.before.shares} → ${c.after.shares} shares`);
                      }
                      if (c.before.costBasis !== c.after.costBasis) {
                        const before =
                          c.before.costBasis === null
                            ? "basis unknown"
                            : `basis ${money(c.before.costBasis)}/sh`;
                        const after =
                          c.after.costBasis === null
                            ? "basis unknown"
                            : `basis ${money(c.after.costBasis)}/sh`;
                        parts.push(`${before} → ${after}`);
                      }
                      return (
                        <li key={i}>
                          {c.before.ticker}: {parts.join(" · ")}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              {diff.removed.length > 0 && (
                <div className="pf-diff-group">
                  <h3>Removed ({diff.removed.length})</h3>
                  <ul className="pf-list">
                    {diff.removed.map((l) => (
                      <li key={l.id}>
                        {l.ticker} · {l.shares} sh (counts as sold or closed)
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="pf-actions">
                <button type="button" className="pf-btn-primary" onClick={apply}>
                  Apply upload
                </button>
              </div>
              <p className="card-note">
                Prototype only: applying updates this demo in memory. The real
                app saves to your private store.
              </p>
            </>
          )}
        </section>
      )}
    </>
  );
}
