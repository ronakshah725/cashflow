// Flag chips: icon dot plus words, never color alone. Tapping a chip
// expands its one-sentence explanation inline. At most three chips show
// per row; the rest hide behind a "+n more" toggle that collapses back
// to "show fewer". Rows are severity-ordered before slicing, so the
// highest-stakes flag (wash-sale risk first) never hides behind "+n
// more", no matter what order the flags were computed in.

import { useState } from "react";
import { flagSeverity } from "../../lib/portfolio-math";
import type { Flag } from "../../lib/portfolio-types";

function tone(kind: Flag["kind"]): string {
  switch (kind) {
    case "harvest-short":
    case "harvest-long":
      return "pf-dot-loss";
    case "turning-long-term":
      return "pf-dot-good";
    case "wash-risk":
    case "overweight":
    case "stale-price":
    case "possible-split":
    case "missing-basis":
    case "unclassified":
      return "pf-dot-warn";
    default:
      return "pf-dot-mute";
  }
}

export function FlagChip({ flag }: { flag: Flag }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="pf-flag-wrap">
      <button
        type="button"
        className="pf-flag"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={flag.detail}
      >
        <span className={`pf-dot ${tone(flag.kind)}`} aria-hidden="true" />
        {flag.label}
      </button>
      {open && <span className="pf-flag-detail">{flag.detail}</span>}
    </span>
  );
}

/** Capped flag row: worst three chips first, then "+n more" / "show fewer". */
export function FlagList({ flags }: { flags: Flag[] }) {
  const [all, setAll] = useState(false);
  if (flags.length === 0) return null;
  const ordered = [...flags].sort((a, b) => flagSeverity(a.kind) - flagSeverity(b.kind));
  const shown = all ? ordered : ordered.slice(0, 3);
  return (
    <span className="pf-flags">
      {shown.map((f) => (
        <FlagChip key={f.kind} flag={f} />
      ))}
      {flags.length > 3 && (
        <button
          type="button"
          className="pf-flag-more"
          onClick={() => setAll((v) => !v)}
        >
          {all ? "show fewer" : `+${flags.length - 3} more`}
        </button>
      )}
    </span>
  );
}
