import { fmtK, money, type FlowLink, type FlowNode } from "../lib/calc";

interface Props {
  nodes: FlowNode[];
  links: FlowLink[];
  phase: 1 | 2;
  onPhase: (p: 1 | 2) => void;
  includeBonus: boolean;
}

const W = 360;
const H = 300;
const NODE_W = 12;
const LEFT_X = 96;
const RIGHT_X = W - LEFT_X - NODE_W;
const TOP = 12;
const BOTTOM = 12;
const GAP = 10;

interface PlacedNode extends FlowNode {
  x: number;
  y: number;
  h: number;
  column: 0 | 1;
}

/** Two-column Sankey: sources left, destinations right, widths are dollars. */
export function MoneyFlow({ nodes, links, phase, onPhase, includeBonus }: Props) {
  const sourceIds = new Set(links.map((l) => l.source));
  const left = nodes.filter((n) => sourceIds.has(n.id));
  const right = nodes.filter((n) => !sourceIds.has(n.id));

  const total = Math.max(
    left.reduce((s, n) => s + n.value, 0),
    right.reduce((s, n) => s + n.value, 0),
    1,
  );
  const scale = (H - TOP - BOTTOM - GAP * (Math.max(left.length, right.length) - 1)) / total;

  const place = (list: FlowNode[], column: 0 | 1): PlacedNode[] => {
    const x = column === 0 ? LEFT_X : RIGHT_X;
    let y = TOP;
    return list.map((n) => {
      const p = { ...n, x, y, h: Math.max(2, n.value * scale), column };
      y += p.h + GAP;
      return p;
    });
  };
  const placed = new Map<string, PlacedNode>();
  for (const p of [...place(left, 0), ...place(right, 1)]) placed.set(p.id, p);

  // Lay out link bands in an order that avoids crossings.
  const rightOrder = new Map(right.map((n, i) => [n.id, i]));
  const ordered = [...links].sort((a, b) => {
    if (a.source !== b.source) return a.source < b.source ? -1 : 1;
    return (rightOrder.get(a.target) ?? 0) - (rightOrder.get(b.target) ?? 0);
  });
  const used = new Map<string, number>();
  const take = (id: string, v: number) => {
    const y = (placed.get(id)?.y ?? 0) + (used.get(id) ?? 0);
    used.set(id, (used.get(id) ?? 0) + v * scale);
    return y;
  };
  const midX = (LEFT_X + NODE_W + RIGHT_X) / 2;
  const paths = ordered.map((l, i) => {
    const s = placed.get(l.source)!;
    const t = placed.get(l.target)!;
    const w = Math.max(1.5, l.value * scale);
    const y0 = take(l.source, l.value) + w / 2;
    const y1 = take(l.target, l.value) + w / 2;
    const x0 = s.x + NODE_W;
    const x1 = t.x;
    return (
      <path
        key={i}
        d={`M ${x0},${y0} C ${midX},${y0} ${midX},${y1} ${x1},${y1}`}
        fill="none"
        stroke={l.color}
        strokeOpacity={0.38}
        strokeWidth={w}
      >
        <title>
          {s.label} → {t.label}: {money(l.value)}/mo
        </title>
      </path>
    );
  });

  const label = (p: PlacedNode) => {
    const cy = p.y + p.h / 2;
    const anchor = p.column === 0 ? "end" : "start";
    const x = p.column === 0 ? p.x - 8 : p.x + NODE_W + 8;
    return (
      <g key={p.id}>
        <text x={x} y={cy - 3} textAnchor={anchor} fontSize={11} fill="#e8efe9">
          {p.label}
        </text>
        <text x={x} y={cy + 11} textAnchor={anchor} fontSize={10} fill="#9db0a4">
          {fmtK(p.value)}
        </text>
      </g>
    );
  };

  return (
    <section className="card" aria-label="Where the money goes">
      <div className="card-head">
        <h2>Where the money goes</h2>
        <div className="seg" role="group" aria-label="Phase">
          <button
            type="button"
            className={phase === 1 ? "on" : ""}
            onClick={() => onPhase(1)}
            aria-pressed={phase === 1}
          >
            Phase 1
          </button>
          <button
            type="button"
            className={phase === 2 ? "on" : ""}
            onClick={() => onPhase(2)}
            aria-pressed={phase === 2}
          >
            Phase 2
          </button>
        </div>
      </div>
      <div className="chart">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height={H}
          role="img"
          aria-label="Flow of monthly dollars from income to spending and investing"
        >
          {paths}
          {[...placed.values()].map((p) => (
            <rect
              key={p.id}
              x={p.x}
              y={p.y}
              width={NODE_W}
              height={p.h}
              rx={3}
              fill={p.color}
            >
              <title>
                {p.label}: {money(p.value)}/mo
              </title>
            </rect>
          ))}
          {[...placed.values()].map(label)}
        </svg>
      </div>
      <p className="card-note">
        {includeBonus
          ? "Bonus flows straight to investing, spread monthly."
          : "Bonus excluded."}{" "}
        One-time reserves are separate.
      </p>
    </section>
  );
}
