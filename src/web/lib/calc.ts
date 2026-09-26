import type { Assumptions, ChildcareOption } from "./types";

/** Formats a number as whole-dollar USD. */
export function money(n: number): string {
  return (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
}

/** Compact thousands form for axes and headlines. */
export function fmtK(v: number): string {
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  if (abs >= 1000) {
    const k = abs / 1000;
    return `${sign}$${Number.isInteger(k) ? k.toFixed(0) : k.toFixed(1)}k`;
  }
  return `${sign}$${Math.round(abs)}`;
}

export function childcareAmount(a: Assumptions, options: ChildcareOption[]): number {
  if (a.childcare === "custom") return Math.max(0, a.childcareCustom);
  const opt = options.find((o) => o.id === a.childcare);
  if (!opt || opt.amount === null) return 0;
  return opt.amount;
}

export interface PhaseNumbers {
  cash: number;
  total: number;
  netPct: string;
  grossPct: string | null;
  totalLabel: string;
}

export interface CalcResult {
  phase1: PhaseNumbers;
  phase2: PhaseNumbers;
  phase1End: string;
  phase2Start: string;
  oneTimeTotal: number;
  broker: number;
  gearEffective: number;
  medical: number;
  phaseDelta: number;
}

function phaseNumbers(
  netCash: number,
  netTotal: number,
  a: Assumptions,
  totalLabel: string,
): PhaseNumbers {
  const netInflow = a.hisPay + a.herPay + (a.includeBonus ? a.bonusNet / 12 : 0);
  const netPct = netInflow > 0 ? `${Math.round((netCash / netInflow) * 100)}%` : "—";
  const grossMonthly = a.grossBase > 0 ? a.grossBase / 12 : 0;
  const grossPct =
    grossMonthly > 0 ? `${Math.round((netTotal / grossMonthly) * 100)}%` : null;
  return { cash: netCash, total: netTotal, netPct, grossPct, totalLabel };
}

export function compute(
  a: Assumptions,
  movers: number,
  options: ChildcareOption[],
  gearAssigned = 0,
): CalcResult {
  const lifestyle = a.dining + a.groceries + a.coffee + a.other;
  const housing = a.rent + a.housing;
  const income = a.hisPay + a.herPay;
  const bonusMonthly = a.includeBonus ? a.bonusNet / 12 : 0;

  const phase1Cash = income - housing - lifestyle;
  const phase1Total = phase1Cash + bonusMonthly;

  const childcare = childcareAmount(a, options);
  const babyMonthly = childcare + a.consumables + a.formula;
  const phase2Cash = phase1Cash - babyMonthly;
  const phase2Total = phase2Cash + bonusMonthly;

  const [by, bm] = a.startMonth.split("-").map(Number);
  const phase2Start = new Date(by, bm - 1, 1).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });
  const phase1End = new Date(by, bm - 2, 1).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });

  const gearEffective = Math.max(a.gear, gearAssigned);
  const broker = a.rent;
  const oneTimeTotal = broker + movers + gearEffective + a.medical;

  return {
    phase1: phaseNumbers(phase1Cash, phase1Total, a, "total investing"),
    phase2: phaseNumbers(phase2Cash, phase2Total, a, "total investing"),
    phase1End,
    phase2Start,
    oneTimeTotal,
    broker,
    gearEffective,
    medical: a.medical,
    phaseDelta: phase1Total - phase2Total,
  };
}

/* ------------------------------------------------------------------ */
/* Dashboard view models                                                */
/* ------------------------------------------------------------------ */

/** Plain-language fragment for the verdict headline. */
export function childcareShort(id: string): string {
  switch (id) {
    case "daycare":
      return "daycare";
    case "nanny":
      return "a formal nanny";
    case "aunty":
      return "an informal aunty";
    case "none":
      return "family help";
    case "custom":
      return "custom childcare";
    default:
      return "childcare";
  }
}

/** Bar label variant (title case, short). */
export function childcareBarLabel(id: string): string {
  switch (id) {
    case "daycare":
      return "Daycare";
    case "nanny":
      return "Nanny";
    case "aunty":
      return "Aunty";
    case "none":
      return "Family";
    case "custom":
      return "Custom";
    default:
      return id;
  }
}

export function verdictWord(total: number): string {
  if (total >= 10000) return "Comfortable.";
  if (total >= 5000) return "Workable.";
  if (total >= 0) return "Tight.";
  return "In the red.";
}

export interface WaterfallStep {
  name: string;
  base: number;
  delta: number;
  kind: "income" | "cost" | "bonus" | "total";
}

/** Waterfall steps: income minus cost buckets equals monthly investing. */
export function waterfall(
  a: Assumptions,
  options: ChildcareOption[],
  phase: 1 | 2,
): WaterfallStep[] {
  const income = a.hisPay + a.herPay;
  const housing = a.rent + a.housing;
  const lifestyle = a.dining + a.groceries + a.coffee + a.other;
  const baby =
    phase === 2 ? childcareAmount(a, options) + a.consumables + a.formula : 0;
  const bonus = a.includeBonus ? a.bonusNet / 12 : 0;

  const steps: WaterfallStep[] = [];
  let run = 0;
  const push = (name: string, delta: number, kind: WaterfallStep["kind"]) => {
    steps.push({ name, base: kind === "total" ? 0 : run, delta, kind });
    run += delta;
  };
  push("Income", income, "income");
  push("Housing", -housing, "cost");
  push("Lifestyle", -lifestyle, "cost");
  if (phase === 2) push("Baby + care", -baby, "cost");
  if (a.includeBonus) push("Bonus /12", bonus, "bonus");
  push("Investing", run, "total");
  return steps;
}

export interface ScenarioResult {
  id: string;
  label: string;
  cash: number;
  bonus: number;
  total: number;
}

/** Phase-2 monthly investing under each childcare scenario id. */
export function scenarioResults(
  a: Assumptions,
  movers: number,
  options: ChildcareOption[],
  ids: string[],
): ScenarioResult[] {
  const out: ScenarioResult[] = [];
  for (const id of ids) {
    if (!options.some((o) => o.id === id)) continue;
    const c = compute({ ...a, childcare: id }, movers, options);
    out.push({
      id,
      label: childcareBarLabel(id),
      cash: c.phase2.cash,
      bonus: Math.max(0, c.phase2.total - c.phase2.cash),
      total: c.phase2.total,
    });
  }
  return out;
}

export interface TimelinePoint {
  m: number;
  label: string;
  cash: number;
  bonus: number;
}

function monthLabel(d: Date): string {
  return (
    d.toLocaleString("en-US", { month: "short" }) +
    " '" +
    String(d.getFullYear()).slice(2)
  );
}

/**
 * Cumulative investing month by month for the next `months` months.
 * Rent-only (Phase 1) until the baby-start month, Phase 2 after.
 * Bonus is its own stacked layer.
 */
export function buildTimeline(
  a: Assumptions,
  movers: number,
  options: ChildcareOption[],
  months = 60,
): { points: TimelinePoint[]; babyOffset: number } {
  const c = compute(a, movers, options);
  const now = new Date();
  const [sy, sm] = a.startMonth.split("-").map(Number);
  const babyOffset = Math.max(
    0,
    (sy - now.getFullYear()) * 12 + (sm - 1 - now.getMonth()),
  );
  const bonusMo = a.includeBonus ? a.bonusNet / 12 : 0;

  let cash = 0;
  let bonus = 0;
  const points: TimelinePoint[] = [];
  for (let m = 0; m <= months; m++) {
    if (m > 0) {
      const phase = m <= babyOffset ? c.phase1 : c.phase2;
      cash += phase.cash;
      bonus += bonusMo;
    }
    const d = new Date(now.getFullYear(), now.getMonth() + m, 1);
    points.push({
      m,
      label: monthLabel(d),
      cash: Math.round(cash),
      bonus: Math.round(bonus),
    });
  }
  return { points, babyOffset };
}

/** Axis formatter for large cumulative values. */
export function fmtAxis(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1000) return `$${Math.round(v / 1000)}k`;
  return `$${Math.round(v)}`;
}
