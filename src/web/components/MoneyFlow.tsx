import { useEffect, useRef, useState } from "react";
import { fmtK, money, type FlowLink, type FlowNode } from "../lib/calc";

interface Props {
  nodes: FlowNode[];
  links: FlowLink[];
  phase: 1 | 2;
  onPhase: (p: 1 | 2) => void;
  includeBonus: boolean;
}

const NODE_W = 14;
const LABEL_MARGIN = 100;
const TOP = 16;
const BOTTOM = 16;
const GAP = 14;

interface PlacedNode extends FlowNode {
  x: number;
  y: number;
  h: number;
  column: 0 | 1;
}

/**
 * Two-column Sankey: sources left, destinations right, widths are dollars.
 * Measured responsive: 1 SVG unit = 1 CSS px, so labels stay readable on
 * any screen and the diagram always fills its container.
 */
export function MoneyFlow({ nodes, links, phase, onPhase, includeBonus }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cw = Math.round(entries[0].contentRect.width);
      if (cw > 0) setW(cw);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const W = Math.max(300, w);
  const H = Math.round(Math.min(430, Math.max(300, W * 0.45)));
  const leftX = LABEL_MARGIN;
  const rightX = W - LABEL_MARGIN - NODE_W;

  const sourceIds = new Set(links.map((l) => l.source));
  const left = nodes.filter((n) => sourceIds.has(n.id));
  const right = nodes.filter((n) => !sourceIds.has(n.id));

  const colTotal = (list: FlowNode[]) => list.reduce((s, n) => s + n.value, 0);
  const scale = Math.min(
    (H - TOP - BOTTOM - GAP * (left.length - 1)) / Math.max(1, colTotal(left)),
    (H - TOP - BOTTOM - GAP * (right.length - 1)) / Math.max(1, colTotal(right)),
  );

  const place = (list: FlowNode[], column: 0 | 1): PlacedNode[] => {
    const x = column === 0 ? leftX : rightX;
    const colH = colTotal(list) * scale + GAP * (list.length - 1);
    let y = TOP + Math.max(0, (H - TOP - BOTTOM - colH) / 2);
    return list.map((n) => {
      const p = { ...n, x, y, h: Math.max(3, n.value * scale), column };
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
  const midX = (leftX + NODE_W + rightX) / 2;
  const paths = ordered.map((l, i) => {
    const s = placed.get(l.source)!;
    const t = placed.get(l.target)!;
    const bw = Math.max(2, l.value * scale);
    const y0 = take(l.source, l.value) + bw / 2;
    const y1 = take(l.target, l.value) + bw / 2;
    const x0 = s.x + NODE_W;
    const x1 = t.x;
    return (
      <path
        key={i}
        d={`M ${x0},${y0} C ${midX},${y0} ${midX},${y1} ${x1},${y1}`}
        fill="none"
        stroke={l.color}
        strokeOpacity={0.38}
        strokeWidth={bw}
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
    const x = p.column === 0 ? p.x - 10 : p.x + NODE_W + 10;
    return (
      <g key={p.id}>
        <text x={x} y={cy - 4} textAnchor={anchor} fontSize={12.5} fill="#e8efe9">
          {p.label}
        </text>
        <text x={x} y={cy + 12} textAnchor={anchor} fontSize={11} fill="#9db0a4">
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
      <div className="chart" ref={wrapRef}>
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
