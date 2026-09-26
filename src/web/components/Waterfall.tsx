import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtK, money, type WaterfallStep } from "../lib/calc";

const COLORS: Record<WaterfallStep["kind"], string> = {
  income: "#58b368",
  cost: "#e07856",
  bonus: "#d9a441",
  total: "#3f9e58",
};

function WaterfallTip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const s = payload[1]?.payload ?? payload[0]?.payload;
  if (!s) return null;
  const step = s as WaterfallStep;
  return (
    <div className="chart-tip">
      <strong>{step.name}</strong>
      <span>
        {step.delta >= 0 ? "+" : ""}
        {money(step.delta)}/mo
      </span>
    </div>
  );
}

interface Props {
  steps: WaterfallStep[];
  phase: 1 | 2;
  onPhase: (p: 1 | 2) => void;
  includeBonus: boolean;
}

export function Waterfall({ steps, phase, onPhase, includeBonus }: Props) {
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
        <ResponsiveContainer width="100%" height={250}>
          <BarChart
            data={steps}
            margin={{ top: 8, right: 4, bottom: 0, left: 0 }}
            barCategoryGap="30%"
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#24352c" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fill: "#9db0a4", fontSize: 11 }}
              interval={0}
              tickLine={false}
              axisLine={{ stroke: "#24352c" }}
            />
            <YAxis
              tickFormatter={(v: number) => fmtK(v)}
              tick={{ fill: "#9db0a4", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={52}
            />
            <Tooltip content={<WaterfallTip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
            <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
            <Bar dataKey="delta" stackId="w" radius={[3, 3, 0, 0]}>
              {steps.map((s, i) => (
                <Cell key={i} fill={COLORS[s.kind]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="card-note">
        {includeBonus
          ? "Bonus shown as its own step, spread monthly."
          : "Bonus excluded."}{" "}
        One-time reserves are separate.
      </p>
    </section>
  );
}
