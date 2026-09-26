import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtAxis, money, type TimelinePoint } from "../lib/calc";
import { InfoTip } from "./InfoTip";

function TimelineTip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload as TimelinePoint | undefined;
  if (!p) return null;
  return (
    <div className="chart-tip">
      <strong>{p.label}</strong>
      <span>Cumulative cash flow: {money(p.cash)}</span>
      {p.bonus > 0 && <span>Cumulative bonus: {money(p.bonus)}</span>}
      <span>Total invested: {money(p.cash + p.bonus)}</span>
    </div>
  );
}

interface Props {
  points: TimelinePoint[];
  babyOffset: number;
  birthOffset: number;
}

export function Timeline({ points, babyOffset, birthOffset }: Props) {
  const ticks = [0, 12, 24, 36, 48, 60].filter((t) => t <= points.length - 1);
  const showBirth = birthOffset > 0 && birthOffset !== babyOffset;
  return (
    <section className="card" aria-label="Five year investing timeline">
      <div className="card-head">
        <span className="head-title">
          <h2>5-year compounding runway</h2>
          <InfoTip
            label="About this chart"
            text="Your invested balance growing month by month for five years. One-time costs (broker, movers, gear, medical) come out in the months they actually happen, so the line dips where they land."
          />
        </span>
      </div>
      <div className="legend">
        <span>
          <i className="sw cash" /> Cash flow
        </span>
        <span>
          <i className="sw bonus" /> Bonus
        </span>
      </div>
      <div className="chart">
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={points} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="gCash" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#58b368" stopOpacity={0.55} />
                <stop offset="100%" stopColor="#58b368" stopOpacity={0.08} />
              </linearGradient>
              <linearGradient id="gBonus" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#d9a441" stopOpacity={0.5} />
                <stop offset="100%" stopColor="#d9a441" stopOpacity={0.08} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#24352c" vertical={false} />
            <XAxis
              dataKey="m"
              ticks={ticks}
              tickFormatter={(m: number) => points[m]?.label ?? ""}
              tick={{ fill: "#9db0a4", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "#24352c" }}
            />
            <YAxis
              tickFormatter={(v: number) => fmtAxis(v)}
              tick={{ fill: "#9db0a4", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={52}
            />
            <Tooltip content={<TimelineTip />} cursor={{ stroke: "#2c3f34" }} />
            <ReferenceArea
              x1={0}
              x2={babyOffset}
              fill="rgba(88,179,104,0.07)"
              stroke="none"
              label={{
                value: "Rent only",
                fill: "#9db0a4",
                fontSize: 11,
                position: "insideTopLeft",
              }}
            />
            <ReferenceLine
              x={babyOffset}
              stroke="#d9a441"
              strokeDasharray="4 3"
              label={{
                value: "Baby",
                fill: "#d9a441",
                fontSize: 11,
                position: "insideTopRight",
              }}
            />
            {showBirth && (
              <ReferenceLine
                x={birthOffset}
                stroke="#8fa895"
                strokeDasharray="2 3"
                label={{
                  value: "One-time",
                  fill: "#8fa895",
                  fontSize: 10,
                  position: "insideTopLeft",
                }}
              />
            )}
            <Area
              type="monotone"
              dataKey="cash"
              stackId="1"
              stroke="#58b368"
              strokeWidth={2}
              fill="url(#gCash)"
              name="Cash flow"
            />
            <Area
              type="monotone"
              dataKey="bonus"
              stackId="1"
              stroke="#d9a441"
              strokeWidth={2}
              fill="url(#gBonus)"
              name="Bonus"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="card-note">
        Cumulative monthly investing. The shaded window is rent-only; baby costs
        begin at the marker. One-time costs are deducted where they occur:
        broker + movers at the start, gear + medical at the one-time marker
        (around birth).
      </p>
    </section>
  );
}
