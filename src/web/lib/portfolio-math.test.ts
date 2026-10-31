// Tests for the pure portfolio math (src/web/lib/portfolio-math.ts).
// Fixtures are tiny and synthetic. Every test pins a rule the UI relies
// on: parsing never silently drops a row, a diff never blind-appends,
// term math uses the more-than-one-year line, and flags derive from data.

import { describe, expect, it } from "vitest";
import {
  addDaysISO,
  applyDiff,
  buildAllocation,
  buildBrief,
  buildDrawdowns,
  buildHarvest,
  buildLots,
  buildPortfolio,
  computeFlags,
  diffLots,
  diffUpload,
  flagSeverity,
  lotGain,
  lotTerm,
  parseDate,
  parseUploadCsv,
  pct,
  pctUnsigned,
  totalGain,
} from "./portfolio-math";
import type {
  ActivityEvent,
  HoldingInput,
  PortfolioSnapshot,
  PositionView,
  TaxLot,
  UploadDiff,
} from "./portfolio-types";

const AS_OF = "2026-10-31";

function lot(
  ticker: string,
  shares: number,
  costBasis: number | null,
  acquiredDate: string,
): TaxLot {
  return {
    id: `${ticker}:${acquiredDate || "?"}:${costBasis === null ? "?" : String(costBasis)}`,
    ticker,
    shares,
    costBasis,
    acquiredDate,
  };
}

function snap(holdings: HoldingInput[], activity: ActivityEvent[] = []): PortfolioSnapshot {
  return {
    portfolioId: "test",
    portfolioLabel: "Test",
    version: 1,
    holdingsAsOf: "2026-10-30",
    pricesAsOf: "2026-10-30",
    holdings,
    activity,
    lastDiff: null,
  };
}

describe("parseUploadCsv", () => {
  it("parses the standard header", () => {
    const { rows, errors } = parseUploadCsv(
      "ticker,shares,costBasis,acquiredDate\nAAA,10,20,2024-01-05\nBBB,5,,2023-06-01\n",
    );
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { ticker: "AAA", shares: 10, costBasis: 20, acquiredDate: "2024-01-05" },
      { ticker: "BBB", shares: 5, costBasis: null, acquiredDate: "2023-06-01" },
    ]);
  });

  it("accepts flexible header names and lowercases tickers", () => {
    const { rows, errors } = parseUploadCsv(
      "Symbol, Shares Held, Cost, Date\naaa,10,20,2024-01-05\n",
    );
    expect(errors).toEqual([]);
    expect(rows[0].ticker).toBe("AAA");
  });

  it("reports bad rows with line numbers instead of dropping them", () => {
    const { errors } = parseUploadCsv(
      "ticker,shares,costBasis,acquiredDate\nAAA,notanumber,20,2024-01-05\nBBB,5,20,15-01-2024\n",
    );
    expect(errors).toHaveLength(2);
    expect(errors[0].line).toBe(2);
    expect(errors[1].line).toBe(3);
  });

  it("strips surrounding quotes per cell", () => {
    const { rows, errors } = parseUploadCsv(
      '"ticker","shares","costBasis","acquiredDate"\n"AAA",10,20,2024-01-05\n',
    );
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { ticker: "AAA", shares: 10, costBasis: 20, acquiredDate: "2024-01-05" },
    ]);
  });

  it("rejects impossible dates instead of rolling them over", () => {
    expect(parseDate("2026-02-30")).toBeNull();
    const { errors } = parseUploadCsv(
      "ticker,shares,costBasis,acquiredDate\nAAA,10,20,2026-02-30\n",
    );
    expect(errors).toHaveLength(1);
  });

  it("rejects a file without ticker and shares headers", () => {
    const { errors } = parseUploadCsv("name,amount\nAAA,10\n");
    expect(errors.length).toBeGreaterThan(0);
  });

  it("merges duplicate lot keys by summing shares", () => {
    const { rows, errors } = parseUploadCsv(
      "ticker,shares,costBasis,acquiredDate\nAAA,10,20,2024-01-05\nAAA,5,20,2024-01-05\n",
    );
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0].shares).toBe(15);
  });
});

describe("diff and apply", () => {
  const current = [
    lot("AAA", 10, 20, "2024-01-05"),
    lot("BBB", 5, 30, "2023-01-05"),
    lot("CCC", 8, 10, "2022-01-05"),
  ];

  it("splits added, removed, changed, and unchanged", () => {
    const diff = diffLots(current, [
      { ticker: "AAA", shares: 10, costBasis: 20, acquiredDate: "2024-01-05" },
      { ticker: "BBB", shares: 7, costBasis: 30, acquiredDate: "2023-01-05" },
      { ticker: "DDD", shares: 3, costBasis: 40, acquiredDate: "2026-01-05" },
    ]);
    expect(diff.unchanged.map((l) => l.ticker)).toEqual(["AAA"]);
    expect(diff.changed.map((c) => c.before.ticker)).toEqual(["BBB"]);
    expect(diff.removed.map((l) => l.ticker)).toEqual(["CCC"]);
    expect(diff.added.map((r) => r.ticker)).toEqual(["DDD"]);
    expect(diff.ok).toBe(true);
  });

  it("a basis correction reads as one changed lot, not removed plus added", () => {
    const diff = diffLots(current, [
      { ticker: "AAA", shares: 10, costBasis: 25, acquiredDate: "2024-01-05" },
      { ticker: "BBB", shares: 5, costBasis: 30, acquiredDate: "2023-01-05" },
      { ticker: "CCC", shares: 8, costBasis: 10, acquiredDate: "2022-01-05" },
    ]);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.changed.map((c) => c.before.ticker)).toEqual(["AAA"]);
    expect(diff.changed[0].after.costBasis).toBe(25);
    const next = applyDiff(current, diff);
    const aaa = next.find((l) => l.ticker === "AAA")!;
    expect(aaa.costBasis).toBe(25);
    expect(aaa.id).toBe("AAA:2024-01-05:25");
    expect(next).toHaveLength(3);
  });

  it("a diff with parse errors is not applicable", () => {
    const diff = diffUpload(current, "ticker,shares\nAAA,oops\n");
    expect(diff.ok).toBe(false);
    expect(applyDiff(current, diff)).toEqual(current);
  });

  it("apply never blind-appends: it removes, updates, and adds exactly", () => {
    const diff: UploadDiff = {
      added: [{ ticker: "DDD", shares: 3, costBasis: 40, acquiredDate: "2026-01-05" }],
      removed: [lot("CCC", 8, 10, "2022-01-05")],
      changed: [
        {
          before: lot("BBB", 5, 30, "2023-01-05"),
          after: { ticker: "BBB", shares: 7, costBasis: 30, acquiredDate: "2023-01-05" },
        },
      ],
      unchanged: [lot("AAA", 10, 20, "2024-01-05")],
      errors: [],
      ok: true,
    };
    const next = applyDiff(current, diff);
    expect(next.map((l) => `${l.ticker}:${l.shares}`).sort()).toEqual([
      "AAA:10",
      "BBB:7",
      "DDD:3",
    ]);
  });
});

describe("lot term and gain", () => {
  it("364 and 365 days are short, 366 days is long", () => {
    expect(lotTerm("2025-11-01", AS_OF).term).toBe("short");
    // Exactly one year held is still short-term: the rule is MORE than
    // one year, so day 366 is the first long-term day.
    expect(lotTerm("2025-10-31", AS_OF).term).toBe("short");
    expect(lotTerm("2025-10-30", AS_OF).term).toBe("long");
  });

  it("missing date means unknown term", () => {
    expect(lotTerm("", AS_OF)).toEqual({ term: "unknown", daysHeld: null });
  });

  it("gain is null without a basis or a price", () => {
    expect(lotGain(lot("AAA", 10, null, "2024-01-05"), 30)).toBeNull();
    expect(lotGain(lot("AAA", 10, 20, "2024-01-05"), null)).toBeNull();
    expect(lotGain(lot("AAA", 10, 20, "2024-01-05"), 30)).toBe(100);
  });

  it("a zero gain never reads as a loss from float error", () => {
    // 0.1 + 0.2 is 0.30000000000000004, so the raw difference against
    // a 0.3 price is a tiny negative number without cent rounding.
    expect(lotGain(lot("AAA", 10, 0.1 + 0.2, "2024-01-05"), 0.3)).toBe(0);
  });

  it("turning long-term lands on the 366th day", () => {
    expect(addDaysISO("2025-11-15", 366)).toBe("2026-11-16");
  });
});

describe("allocation", () => {
  const s = snap([
    {
      ticker: "AAA",
      name: "A",
      sector: "Tech",
      supplyChain: "Software",
      price: 100,
      priceAsOf: "2026-10-30",
      lots: [lot("AAA", 10, 50, "2023-01-01")],
      peaks: {},
    },
    {
      ticker: "BBB",
      name: "B",
      sector: "Tech",
      supplyChain: "Devices",
      price: 100,
      priceAsOf: "2026-10-30",
      lots: [lot("BBB", 30, 50, "2023-01-01")],
      peaks: {},
    },
    {
      ticker: "CCC",
      name: "C",
      sector: "Energy",
      supplyChain: "Energy",
      price: 100,
      priceAsOf: "2026-10-30",
      lots: [lot("CCC", 60, 50, "2023-01-01")],
      peaks: {},
    },
  ]);

  it("groups by sector with value weighting", () => {
    const a = buildAllocation(s, "sector", "value", AS_OF);
    expect(a.totalValue).toBe(10000);
    expect(a.groups.map((g) => g.label)).toEqual(["Energy", "Tech"]);
    expect(a.groups[0].pct).toBeCloseTo(0.6);
  });

  it("company weighting counts holdings, not dollars", () => {
    const a = buildAllocation(s, "sector", "company", AS_OF);
    const tech = a.groups.find((g) => g.label === "Tech")!;
    expect(tech.companies).toBe(2);
    expect(tech.pct).toBeCloseTo(2 / 3);
  });
});

describe("drawdowns", () => {
  it("drawdown is price over peak minus one, worst window wins", () => {
    const s = snap([
      {
        ticker: "AAA",
        name: "A",
        sector: "Tech",
        supplyChain: "Software",
        price: 80,
        priceAsOf: "2026-10-30",
        lots: [lot("AAA", 10, 50, "2023-01-01")],
        peaks: {
          "1w": { peak: 100, peakDate: "2026-10-27" },
          "1y": { peak: 160, peakDate: "2026-02-01" },
        },
      },
    ]);
    const d = buildDrawdowns(s, AS_OF);
    expect(d.holdings[0].drawdowns["1w"]!.pct).toBeCloseTo(-0.2);
    expect(d.holdings[0].drawdowns["1y"]!.pct).toBeCloseTo(-0.5);
    expect(d.holdings[0].worst).toEqual({ window: "1y", pct: -0.5 });
    expect(d.portfolio["1y"]).toBeCloseTo(-0.5);
  });
});

describe("flags", () => {
  const ctx = {
    asOf: AS_OF,
    totalValue: 10000,
    activity: [] as ActivityEvent[],
    latestDiff: null,
    worstDrawdown: null,
  };

  it("closed positions return only the closed flag", () => {
    const flags = computeFlags("AAA", 0, 0, null, [], null, "Tech", false, ctx);
    expect(flags.map((f) => f.kind)).toEqual(["closed"]);
  });

  it("overweight, missing basis, stale price, and unclassified derive from data", () => {
    const flags = computeFlags(
      "AAA",
      100,
      2000,
      "2026-10-01",
      [lot("AAA", 100, null, "2023-01-01")],
      20,
      "Unclassified",
      false,
      ctx,
    );
    expect(flags.map((f) => f.kind)).toEqual(
      expect.arrayContaining(["overweight", "missing-basis", "stale-price", "unclassified"]),
    );
  });

  it("wash risk needs a recent sale plus a recent buy", () => {
    const activity: ActivityEvent[] = [
      { id: "1", kind: "sell", ticker: "AAA", shares: 10, date: "2026-10-05", note: "" },
      { id: "2", kind: "buy", ticker: "AAA", shares: 10, date: "2026-10-12", note: "" },
    ];
    const flags = computeFlags(
      "AAA",
      10,
      100,
      "2026-10-30",
      [lot("AAA", 10, 20, "2026-10-12")],
      10,
      "Tech",
      false,
      { ...ctx, activity },
    );
    expect(flags.map((f) => f.kind)).toContain("wash-risk");
  });

  it("a buy 24 days before an older sale still flags wash risk", () => {
    // Sale-anchored: both events are older than 30 days from asOf, so
    // an asOf-anchored window would miss this genuine wash pair.
    const activity: ActivityEvent[] = [
      { id: "1", kind: "sell", ticker: "AAA", shares: 10, date: "2026-08-20", note: "" },
      { id: "2", kind: "buy", ticker: "AAA", shares: 10, date: "2026-07-27", note: "" },
    ];
    const flags = computeFlags(
      "AAA",
      10,
      100,
      "2026-10-30",
      [lot("AAA", 10, 20, "2024-01-01")],
      10,
      "Tech",
      false,
      { ...ctx, activity },
    );
    expect(flags.map((f) => f.kind)).toContain("wash-risk");
  });

  it("turning long-term names the calendar date, on the 366th day", () => {
    const flags = computeFlags(
      "AAA",
      10,
      300,
      "2026-10-30",
      [lot("AAA", 10, 20, "2025-11-15")],
      30,
      "Tech",
      false,
      ctx,
    );
    const turning = flags.find((f) => f.kind === "turning-long-term")!;
    expect(turning.detail).toContain("Nov 16, 2026");
  });

  it("deep drawdown names the triggering window", () => {
    const flags = computeFlags(
      "AAA",
      10,
      100,
      "2026-10-30",
      [lot("AAA", 10, 20, "2024-01-01")],
      10,
      "Tech",
      false,
      { ...ctx, worstDrawdown: { pct: -0.25, window: "3y" as const } },
    );
    const dd = flags.find((f) => f.kind === "deep-drawdown")!;
    expect(dd.label).toBe("Deep drawdown (3y)");
  });
});

describe("harvest", () => {
  it("ranks losses worst first and totals them", () => {
    const s = snap([
      {
        ticker: "AAA",
        name: "A",
        sector: "Tech",
        supplyChain: "Software",
        price: 10,
        priceAsOf: "2026-10-30",
        lots: [lot("AAA", 10, 30, "2026-03-01")],
        peaks: {},
      },
      {
        ticker: "BBB",
        name: "B",
        sector: "Tech",
        supplyChain: "Software",
        price: 90,
        priceAsOf: "2026-10-30",
        lots: [lot("BBB", 10, 100, "2022-01-01")],
        peaks: {},
      },
    ]);
    const h = buildHarvest(s, AS_OF);
    expect(h.candidates.map((c) => c.ticker)).toEqual(["AAA", "BBB"]);
    expect(h.totalHarvestable).toBe(-300);
    expect(h.candidates[0].term).toBe("short");
    expect(h.candidates[1].term).toBe("long");
  });

  it("lots without a basis are never harvest candidates", () => {
    const s = snap([
      {
        ticker: "AAA",
        name: "A",
        sector: "Tech",
        supplyChain: "Software",
        price: 10,
        priceAsOf: "2026-10-30",
        lots: [lot("AAA", 10, null, "2026-03-01")],
        peaks: {},
      },
    ]);
    expect(buildHarvest(s, AS_OF).candidates).toEqual([]);
    expect(buildLots(s, AS_OF).lots[0].gain).toBeNull();
  });

  it("an unknown-term losing lot shows no harvest flag", () => {
    const s = snap([
      {
        ticker: "AAA",
        name: "A",
        sector: "Tech",
        supplyChain: "Software",
        price: 10,
        priceAsOf: "2026-10-30",
        lots: [lot("AAA", 10, 30, "")],
        peaks: {},
      },
    ]);
    const [l] = buildLots(s, AS_OF).lots;
    expect(l.term).toBe("unknown");
    expect(l.gain).toBeLessThan(0);
    expect(l.flags.map((f) => f.kind)).not.toContain("harvest-short");
    expect(l.flags.map((f) => f.kind)).not.toContain("harvest-long");
  });

  it("a losing lot on a wash-entangled holding surfaces wash risk", () => {
    const s = snap(
      [
        {
          ticker: "AAA",
          name: "A",
          sector: "Tech",
          supplyChain: "Software",
          price: 10,
          priceAsOf: "2026-10-30",
          lots: [lot("AAA", 10, 30, "2026-03-01")],
          peaks: {},
        },
      ],
      [
        { id: "1", kind: "sell", ticker: "AAA", shares: 5, date: "2026-10-05", note: "" },
        { id: "2", kind: "buy", ticker: "AAA", shares: 5, date: "2026-10-12", note: "" },
      ],
    );
    const [l] = buildLots(s, AS_OF).lots;
    expect(l.flags.map((f) => f.kind)).toContain("harvest-short");
    expect(l.flags.map((f) => f.kind)).toContain("wash-risk");
    expect(buildHarvest(s, AS_OF).candidates[0].washRisk).toBe(true);
  });
});

describe("portfolio staleness and brief gains", () => {
  it("null pricesAsOf reads as stale", () => {
    const s = snap([
      {
        ticker: "AAA",
        name: "A",
        sector: "Tech",
        supplyChain: "Software",
        price: null,
        priceAsOf: null,
        lots: [lot("AAA", 10, 20, "2024-01-01")],
        peaks: {},
      },
    ]);
    s.pricesAsOf = null;
    expect(buildPortfolio(s, AS_OF).pricesStale).toBe(true);
  });

  it("brief gain discloses holdings excluded for missing basis", () => {
    const s = snap([
      {
        ticker: "AAA",
        name: "A",
        sector: "Tech",
        supplyChain: "Software",
        price: 30,
        priceAsOf: "2026-10-30",
        lots: [lot("AAA", 10, 20, "2024-01-01")],
        peaks: {},
      },
      {
        ticker: "BBB",
        name: "B",
        sector: "Tech",
        supplyChain: "Software",
        price: 50,
        priceAsOf: "2026-10-30",
        lots: [lot("BBB", 10, null, "2024-01-01")],
        peaks: {},
      },
    ]);
    const b = buildBrief(s, AS_OF);
    expect(b.totalGain).toBe(100);
    expect(b.gainExcludesMissingBasis).toBe(1);
  });
});

describe("weights, hero gain, and flag severity", () => {
  it("formats weights without a plus sign", () => {
    expect(pctUnsigned(0.446)).toBe("44.6%");
    expect(pctUnsigned(0)).toBe("0.0%");
  });

  it("keeps the sign on signed percents for gains and drawdowns", () => {
    expect(pct(0.234)).toBe("+23.4%");
    expect(pct(-0.2)).toBe("-20.0%");
  });

  it("totals gains and returns null when no position has a basis", () => {
    const pos = (gain: number | null) => ({ gain }) as PositionView;
    expect(totalGain([pos(100), pos(null), pos(-40)])).toBe(60);
    expect(totalGain([pos(null)])).toBeNull();
    expect(totalGain([])).toBeNull();
  });

  it("ranks action flags above informational flags", () => {
    expect(flagSeverity("wash-risk")).toBeLessThan(flagSeverity("harvest-short"));
    expect(flagSeverity("harvest-short")).toBeLessThan(flagSeverity("deep-drawdown"));
    expect(flagSeverity("deep-drawdown")).toBeLessThan(flagSeverity("bought-recently"));
  });
});
