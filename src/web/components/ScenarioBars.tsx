import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtK, money, type ScenarioResult } from "../lib/calc";
import { InfoTip } from "./InfoTip";

function ScenarioTip({ active, payload, selectedLabel }: any) {
  if (!active || !payload?.length) return null;
  const r = payload[0]?.payload as
    | (ScenarioResult & { delta: number })
    | undefined;
  if (!r) return null;
  return (
    <div className="chart-tip">
      <strong>{r.label}</strong>
      <span>Total investing: {money(r.total)}/mo</span>
      {r.delta !== 0 && (
        <span>
          {r.delta > 0 ? "+" : ""}
          {money(r.delta)}/mo vs {selectedLabel}
        </span>
      )}
      {r.delta === 0 && <span>Your selected plan</span>}
    </div>
  );
}

function ScenarioTick({ x, y, payload, selectedId, rows }: any) {
  const row = rows.find((r: any) => r.label === payload.value);
  const charted = !!row;
  const isSel = row?.id === selectedId;
  const delta = row?.delta ?? 0;
  // When the selected plan isn't one of the charted three (aunty/custom),
  // there is no meaningful baseline: show no delta.
  const showDelta = charted && rows.some((r: any) => r.id === selectedId);
  const deltaText = !showDelta
    ? ""
    : isSel
      ? "your plan"
      : `${delta > 0 ? "+" : ""}${fmtK(delta)}/mo`;
  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={0}
        y={0}
        dy={12}
        textAnchor="middle"
        fill={isSel ? "#e8efe9" : "#9db0a4"}
        fontSize={11}
        fontWeight={isSel ? 700 : 400}
      >
        {payload.value}
      </text>
      <text
        x={0}
        y={0}
        dy={26}
        textAnchor="middle"
        fill={isSel ? "#8fa895" : delta > 0 ? "#58b368" : "#e07856"}
        fontSize={10}
      >
        {deltaText}
      </text>
    </g>
  );
}

interface Props {
  scenarios: ScenarioResult[];
  selectedId: string;
}

/**
 * The highest-weight decision: childcare plan vs monthly investing.
 * One total-investing bar per plan; every bar is annotated with its delta
 * versus the currently selected plan.
 */
export function ScenarioBars({ scenarios, selectedId }: Props) {
  const selected = scenarios.find((s) => s.id === selectedId);
  const rows = scenarios.map((s) => ({
    ...s,
    delta: s.total - (selected?.total ?? s.total),
  }));
  const selectedLabel = selected?.label ?? "";

  return (
    <section className="card" aria-label="Childcare scenarios">
      <div className="card-head">
        <span className="head-title">
          <h2>Childcare decides the budget</h2>
          <InfoTip
            label="About this chart"
            text="Same household, three childcare plans. Each bar is total monthly investing once baby costs start. The figure under each plan is how much more or less it leaves you versus your selected plan."
          />
        </span>
      </div>
      <div className="chart">
        <ResponsiveContainer width="100%" height={250}>
          <BarChart
            data={rows}
            margin={{ top: 18, right: 4, bottom: 0, left: 0 }}
            barCategoryGap="32%"
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#24352c" vertical={false} />
            <XAxis
              dataKey="label"
              tick={
                <ScenarioTick selectedId={selectedId} rows={rows} />
              }
              interval={0}
              tickLine={false}
              axisLine={{ stroke: "#24352c" }}
              height={44}
            />
            <YAxis
              tickFormatter={(v: number) => fmtK(v)}
              tick={{ fill: "#9db0a4", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={52}
            />
            <Tooltip
              content={<ScenarioTip selectedLabel={selectedLabel} />}
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
            />
            <Bar dataKey="total" radius={[3, 3, 0, 0]} name="Total investing">
              {rows.map((r) => (
                <Cell
                  key={r.id}
                  fill={r.id === selectedId ? "#58b368" : "#2e4a38"}
                />
              ))}
              <LabelList
                dataKey="total"
                position="top"
                formatter={(v: unknown) => fmtK(Number(v))}
                style={{ fill: "#e8efe9", fontSize: 11, fontWeight: 600 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="card-note">
        Phase 2 total monthly investing per plan.
        {selectedLabel
          ? ` Deltas are versus your selected plan (${selectedLabel}).`
          : ""}
      </p>
    </section>
  );
}
