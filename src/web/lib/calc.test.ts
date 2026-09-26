/**
 * Math tests for the cash-flow model (src/web/lib/calc.ts).
 *
 * These pin the dollar logic every lever feeds: phase 1 vs phase 2
 * investing, the Sankey conservation, scenario comparison, and the
 * 5-year timeline. If a lever change doesn't move a number, one of
 * these (or App.test.tsx) fails.
 */
import { describe, expect, it } from "vitest";
import {
  buildTimeline,
  childcareAmount,
  compute,
  fmtK,
  gearTotal,
  money,
  moneyFlow,
  scenarioResults,
  verdictWord,
} from "./calc";
import type { Assumptions, ChildcareOption } from "./types";

const OPTIONS: ChildcareOption[] = [
  { id: "daycare", label: "Daycare", amount: 3500, note: "" },
  { id: "nanny", label: "Nanny", amount: 5500, note: "" },
  { id: "none", label: "Family", amount: 0, note: "" },
  { id: "custom", label: "Custom", amount: null, note: "" },
];

/** Realistic fixture mirroring the seeded household shape. */
function fixture(over: Partial<Assumptions> = {}): Assumptions {
  return {
    hisPay: 10180,
    herPay: 10000,
    bonusNet: 100000,
    includeBonus: true,
    grossBase: 400000,
    rent: 6500,
    housing: 920,
    dining: 800,
    groceries: 900,
    coffee: 150,
    other: 2725,
    travel: 4000,
    childcare: "daycare",
    childcareCustom: 0,
    consumables: 200,
    formula: 150,
    gearItems: [
      { id: "stroller", label: "Stroller", amount: 1000 },
      { id: "crib", label: "Crib + mattress", amount: 700 },
      { id: "carseat", label: "Car seat", amount: 500 },
      { id: "bassinet", label: "Bassinet", amount: 300 },
      { id: "feeding", label: "Feeding", amount: 400 },
      { id: "diapering", label: "Diapering setup", amount: 300 },
      { id: "clothes", label: "Clothes", amount: 400 },
      { id: "carrier", label: "Carrier", amount: 200 },
      { id: "monitor", label: "Monitor", amount: 250 },
      { id: "bath", label: "Bath", amount: 150 },
      { id: "buffer", label: "Buffer", amount: 800 },
    ],
    medical: 10000,
    startMonth: "2027-07",
    ...over,
  };
}

const MOVERS = 2500;

describe("compute", () => {
  it("phase 1: cash = income − housing − lifestyle − travel/12; total adds bonus/12", () => {
    const a = fixture();
    const c = compute(a, MOVERS, OPTIONS);
    const income = a.hisPay + a.herPay; // 20180
    const housing = a.rent + a.housing; // 7420
    const lifestyle = a.dining + a.groceries + a.coffee + a.other; // 4575
    const travelMo = a.travel / 12; // 333.33
    expect(c.phase1.cash).toBeCloseTo(income - housing - lifestyle - travelMo, 6);
    expect(c.phase1.total).toBeCloseTo(c.phase1.cash + a.bonusNet / 12, 6);
  });

  it("annual travel reduces monthly investing by travel/12 in both phases", () => {
    const base = compute(fixture({ travel: 0 }), MOVERS, OPTIONS);
    const withTravel = compute(fixture({ travel: 12000 }), MOVERS, OPTIONS);
    expect(base.phase1.cash - withTravel.phase1.cash).toBe(1000);
    expect(base.phase2.cash - withTravel.phase2.cash).toBe(1000);
  });

  it("phase 2 subtracts the full monthly baby cost", () => {
    const a = fixture();
    const c = compute(a, MOVERS, OPTIONS);
    const babyMonthly = 3500 + a.consumables + a.formula; // 3850
    expect(c.phase2.cash).toBe(c.phase1.cash - babyMonthly);
    expect(c.phase2.total).toBeCloseTo(c.phase2.cash + a.bonusNet / 12, 6);
    expect(c.phaseDelta).toBeCloseTo(babyMonthly, 6);
  });

  it("bonus toggle off removes bonus from totals only", () => {
    const a = fixture({ includeBonus: false });
    const c = compute(a, MOVERS, OPTIONS);
    expect(c.phase1.total).toBe(c.phase1.cash);
    expect(c.phase2.total).toBe(c.phase2.cash);
    // cash-flow figures are untouched by the toggle
    const withBonus = compute(fixture(), MOVERS, OPTIONS);
    expect(c.phase1.cash).toBe(withBonus.phase1.cash);
    expect(c.phase2.cash).toBe(withBonus.phase2.cash);
  });

  it("rent flows straight into phase 1 and phase 2 cash", () => {
    const base = compute(fixture(), MOVERS, OPTIONS);
    const raised = compute(fixture({ rent: 7000 }), MOVERS, OPTIONS);
    expect(base.phase1.cash - raised.phase1.cash).toBe(500);
    expect(base.phase2.cash - raised.phase2.cash).toBe(500);
  });

  it("one-time reserve = broker(first rent) + movers + itemized gear + medical", () => {
    const a = fixture();
    const c = compute(a, MOVERS, OPTIONS);
    expect(c.broker).toBe(a.rent);
    expect(c.gearEffective).toBe(5000);
    expect(c.medical).toBe(a.medical);
    expect(c.oneTimeTotal).toBe(a.rent + MOVERS + 5000 + a.medical);
  });

  it("gearTotal sums the itemized breakdown, falling back to legacy lump-sum gear", () => {
    expect(gearTotal(fixture())).toBe(5000);
    expect(gearTotal(fixture({ gearItems: [], gear: 5000 }))).toBe(5000);
    expect(gearTotal(fixture({ gearItems: [] }))).toBe(0);
  });

  it("phase boundary labels come from the care-start month", () => {
    const c = compute(fixture({ startMonth: "2027-07" }), MOVERS, OPTIONS);
    expect(c.phase2Start).toBe("July 2027");
    expect(c.phase1End).toBe("June 2027");
  });

  it("percentages are computed against net inflow and gross base", () => {
    const a = fixture();
    const c = compute(a, MOVERS, OPTIONS);
    const netInflow = a.hisPay + a.herPay + a.bonusNet / 12;
    expect(c.phase1.netPct).toBe(`${Math.round((c.phase1.cash / netInflow) * 100)}%`);
    expect(c.phase1.grossPct).toBe(
      `${Math.round((c.phase1.total / (a.grossBase / 12)) * 100)}%`,
    );
  });
});

describe("moneyFlow (Sankey conservation)", () => {
  it("every paycheck dollar is accounted for: housing + lifestyle + travel + childcare + investing = income", () => {
    for (const phase of [1, 2] as const) {
      const a = fixture();
      const { nodes, links } = moneyFlow(a, OPTIONS, phase);
      const income = a.hisPay + a.herPay;
      const payOut = links
        .filter((l) => l.source === "pay")
        .reduce((s, l) => s + l.value, 0);
      expect(payOut).toBeCloseTo(income, 6);

      const byId = Object.fromEntries(nodes.map((n) => [n.id, n.value]));
      const housing = a.rent + a.housing;
      const lifestyle = a.dining + a.groceries + a.coffee + a.other;
      const travel = a.travel / 12;
      const childcare =
        phase === 2 ? 3500 + a.consumables + a.formula : 0;
      expect(byId.housing).toBe(housing);
      expect(byId.lifestyle).toBe(lifestyle);
      expect(byId.travel).toBeCloseTo(travel, 6);
      expect(byId.invest).toBeCloseTo(
        income - housing - lifestyle - travel - childcare + (a.includeBonus ? a.bonusNet / 12 : 0),
        6,
      );
      if (phase === 2) {
        expect(byId.childcare).toBe(childcare);
      } else {
        expect(byId.childcare).toBeUndefined();
      }
    }
  });

  it("bonus stream appears only when the toggle is on", () => {
    const on = moneyFlow(fixture(), OPTIONS, 1);
    expect(on.nodes.some((n) => n.id === "bonus")).toBe(true);
    const off = moneyFlow(fixture({ includeBonus: false }), OPTIONS, 1);
    expect(off.nodes.some((n) => n.id === "bonus")).toBe(false);
    expect(off.links.every((l) => l.source !== "bonus")).toBe(true);
  });
});

describe("scenarioResults", () => {
  it("each scenario total matches compute with that childcare option", () => {
    const a = fixture();
    const ids = ["daycare", "nanny", "none"];
    const results = scenarioResults(a, MOVERS, OPTIONS, ids);
    expect(results.map((r) => r.id)).toEqual(ids);
    for (const r of results) {
      const c = compute({ ...a, childcare: r.id }, MOVERS, OPTIONS);
      expect(r.cash).toBe(c.phase2.cash);
      expect(r.total).toBeCloseTo(c.phase2.total, 6);
      expect(r.bonus).toBeCloseTo(Math.max(0, c.phase2.total - c.phase2.cash), 6);
    }
  });

  it("family (no childcare) invests the most, nanny the least", () => {
    const results = scenarioResults(fixture(), MOVERS, OPTIONS, [
      "daycare",
      "nanny",
      "none",
    ]);
    const totals = Object.fromEntries(results.map((r) => [r.id, r.total]));
    expect(totals.none).toBeGreaterThan(totals.daycare);
    expect(totals.daycare).toBeGreaterThan(totals.nanny);
  });

  it("skips ids with no matching option", () => {
    const results = scenarioResults(fixture(), MOVERS, OPTIONS, [
      "daycare",
      "bogus",
    ]);
    expect(results.map((r) => r.id)).toEqual(["daycare"]);
  });
});

describe("buildTimeline", () => {
  // travel 3996 => exactly 333/mo, so every assertion below is integer-exact.
  it("emits months+1 points, deducts one-time costs, switches phase at the baby offset", () => {
    const a = fixture({ travel: 3996, startMonth: "2027-07" });
    const { points, babyOffset, birthOffset } = buildTimeline(a, MOVERS, OPTIONS, 60);
    expect(points).toHaveLength(61);
    expect(babyOffset).toBeGreaterThan(0);
    // birth is ~2 months before care-start; July 2027 stays in Phase 2
    expect(birthOffset).toBe(babyOffset - 2);

    const c = compute(a, MOVERS, OPTIONS);
    const bonusMo = a.bonusNet / 12;
    const moveCosts = a.rent + MOVERS; // broker + movers at month 0
    const babyCosts = 5000 + a.medical; // gear + medical at birth
    expect(c.phase1.cash).toBe(7852);
    expect(c.phase2.cash).toBe(4002);

    // month 0 deducts the move costs immediately
    expect(points[0].cash).toBe(-moveCosts);
    // first month accumulates one month of phase-1 figures
    expect(points[1].cash).toBe(c.phase1.cash - moveCosts);
    expect(points[1].bonus).toBe(Math.round(bonusMo));
    // months before the offset are phase 1, the offset month is phase 2
    expect(points[babyOffset - 1].cash - points[babyOffset - 2].cash).toBe(
      c.phase1.cash,
    );
    expect(points[babyOffset].cash - points[babyOffset - 1].cash).toBe(
      c.phase2.cash,
    );
    // one-time baby costs land at the birth offset (a phase-1 month)
    expect(points[birthOffset].cash - points[birthOffset - 1].cash).toBe(
      c.phase1.cash - babyCosts,
    );
    // cumulative: last point equals months of phase mix minus one-time costs
    // (months 1..babyOffset-1 are phase 1; the offset month itself is phase 2)
    const expectedCash =
      (babyOffset - 1) * c.phase1.cash +
      (60 - babyOffset + 1) * c.phase2.cash -
      moveCosts -
      babyCosts;
    expect(points[60].cash).toBe(expectedCash);
  });

  it("bonus layer accumulates independently of phase", () => {
    const a = fixture();
    const { points } = buildTimeline(a, MOVERS, OPTIONS, 12);
    expect(points[12].bonus).toBeCloseTo(12 * (a.bonusNet / 12), 6);
    const off = buildTimeline(fixture({ includeBonus: false }), MOVERS, OPTIONS, 12);
    expect(off.points[12].bonus).toBe(0);
  });
});

describe("helpers", () => {
  it("childcareAmount honors custom, option, and unknown ids", () => {
    expect(childcareAmount(fixture(), OPTIONS)).toBe(3500);
    expect(
      childcareAmount(fixture({ childcare: "custom", childcareCustom: 4200 }), OPTIONS),
    ).toBe(4200);
    expect(childcareAmount(fixture({ childcare: "none" }), OPTIONS)).toBe(0);
    expect(childcareAmount(fixture({ childcare: "wat" }), OPTIONS)).toBe(0);
  });

  it("money/fmtK format whole dollars compactly", () => {
    expect(money(8185)).toBe("$8,185");
    expect(money(-50)).toBe("-$50");
    expect(fmtK(6500)).toBe("$6.5k");
    expect(fmtK(7000)).toBe("$7k");
    expect(fmtK(500)).toBe("$500");
  });

  it("verdictWord thresholds", () => {
    expect(verdictWord(12000)).toBe("Comfortable.");
    expect(verdictWord(7000)).toBe("Workable.");
    expect(verdictWord(1000)).toBe("Tight.");
    expect(verdictWord(-100)).toBe("In the red.");
  });
});
