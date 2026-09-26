import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtK, money, type ScenarioResult } from "../lib/calc";

function ScenarioTip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const r = payload[0]?.payload as ScenarioResult | undefined;
  if (!r) return null;
  return (
    <div className="chart-tip">
      <strong>{r.label}</strong>
      <span>Cash flow: {money(r.cash)}/mo</span>
      {r.bonus > 0 && <span>Bonus: {money(r.bonus)}/mo</span>}
      <span>Total: {money(r.total)}/mo</span>
    </div>
  );
}

interface Props {
  scenarios: ScenarioResult[];
  includeBonus: boolean;
}

/** The highest-weight decision: childcare plan vs monthly investing. */
export function ScenarioBars({ scenarios, includeBonus }: Props) {
  return (
    <section className="card" aria-label="Childcare scenarios">
      <div className="card-head">
        <h2>Childcare decides the budget</h2>
      </div>
      <div className="legend">
        <span>
          <i className="sw cash" /> Cash flow
        </span>
        <span>
          <i className="sw bonus" /> Bonus /12
        </span>
      </div>
      <div className="chart">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart
            data={scenarios}
            margin={{ top: 18, right: 4, bottom: 0, left: 0 }}
            barCategoryGap="32%"
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#24352c" vertical={false} />
            <XAxis
              dataKey="label"
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
            <Tooltip content={<ScenarioTip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
            <Bar dataKey="cash" stackId="s" fill="#58b368" radius={[0, 0, 0, 0]} name="Cash flow" />
            <Bar dataKey="bonus" stackId="s" fill="#d9a441" radius={[3, 3, 0, 0]} name="Bonus /12">
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
        Phase 2 monthly investing per plan.
        {includeBonus ? "" : " Bonus excluded, so bars show cash flow only."}
      </p>
    </section>
  );
}
