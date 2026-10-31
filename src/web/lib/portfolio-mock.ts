// Mock portfolio store. SYNTHETIC DATA ONLY: fictional tickers, invented
// prices, lots, and dates. Nothing here is a real holding, and the mock
// never reads the user's real portfolio.
//
// The mock implements the same PortfolioStore interface the real Worker
// backend will implement, so every screen below works unchanged once
// the backend lands. States:
//   sample - the full 14-holding demo set (default)
//   stale  - same holdings, but prices from 2026-10-19 and holdings from
//            2026-09-20, so the stale banners and stale-price flags show
//   empty  - nothing ever uploaded, so the empty states show
// Pick with ?portfolioState=sample|stale|empty (default sample).

import {
  applyDiff,
  buildAllocation,
  buildBrief,
  buildDrawdowns,
  buildHarvest,
  buildLots,
  buildPortfolio,
  diffUpload,
  lotKey,
} from "./portfolio-math";
import type {
  ActivityEvent,
  HoldingInput,
  PortfolioSnapshot,
  PortfolioStore,
  TaxLot,
  UploadDiff,
} from "./portfolio-types";

export const MOCK_AS_OF = "2026-10-31";

function lot(
  ticker: string,
  shares: number,
  costBasis: number | null,
  acquiredDate: string,
): TaxLot {
  return { id: lotKey(ticker, acquiredDate, costBasis), ticker, shares, costBasis, acquiredDate };
}

function peak(price: number, date: string) {
  return { peak: price, peakDate: date };
}

const SAMPLE_HOLDINGS: HoldingInput[] = [
  {
    ticker: "NOVA",
    name: "Nova Systems",
    sector: "Info Tech",
    supplyChain: "Enterprise Software",
    price: 210,
    priceAsOf: "2026-10-30",
    lots: [lot("NOVA", 120, 180, "2026-10-20")],
    peaks: {
      "1w": peak(215, "2026-10-27"),
      "1m": peak(225, "2026-10-03"),
      "3m": peak(240, "2026-08-15"),
      "1y": peak(250, "2026-02-10"),
      "3y": peak(260, "2024-11-01"),
    },
  },
  {
    ticker: "QNTM",
    name: "Quantum Labs",
    sector: "Info Tech",
    supplyChain: "Fabless Chip Designers",
    price: 95,
    priceAsOf: "2026-10-30",
    lots: [lot("QNTM", 80, 140, "2026-03-15")],
    peaks: {
      "1w": peak(100, "2026-10-28"),
      "1m": peak(110, "2026-10-06"),
      "3m": peak(130, "2026-08-20"),
      "1y": peak(150, "2026-03-02"),
      "3y": peak(180, "2024-05-14"),
    },
  },
  {
    ticker: "HELX",
    name: "Helix Bio",
    sector: "Health Care",
    supplyChain: "End Markets",
    price: 160,
    priceAsOf: "2026-10-30",
    lots: [lot("HELX", 50, 200, "2025-06-01")],
    peaks: {
      "1w": peak(165, "2026-10-29"),
      "1m": peak(170, "2026-10-10"),
      "3m": peak(175, "2026-08-30"),
      "1y": peak(190, "2026-01-12"),
      "3y": peak(210, "2024-08-05"),
    },
  },
  {
    ticker: "ORBT",
    name: "Orbit Devices",
    sector: "Info Tech",
    supplyChain: "Tech Equipment & Devices",
    price: 45,
    priceAsOf: "2026-10-30",
    lots: [lot("ORBT", 200, 38, "2024-06-01")],
    peaks: {
      "1w": peak(50, "2026-10-27"),
      "1m": peak(55, "2026-10-02"),
      "3m": peak(65, "2026-08-11"),
      "1y": peak(70, "2026-04-18"),
      "3y": peak(80, "2024-09-09"),
    },
  },
  {
    ticker: "PIXL",
    name: "Pixel Media",
    sector: "Consumer Discretionary",
    supplyChain: "End Markets",
    price: 120,
    priceAsOf: "2026-10-30",
    lots: [lot("PIXL", 60, 90, "2025-11-15")],
    peaks: {
      "1w": peak(122, "2026-10-28"),
      "1m": peak(125, "2026-10-08"),
      "3m": peak(130, "2026-08-22"),
      "1y": peak(140, "2026-02-14"),
      "3y": peak(150, "2024-12-01"),
    },
  },
  {
    ticker: "ZEPH",
    name: "Zephyr Energy",
    sector: "Energy",
    supplyChain: "Specialty Energy",
    price: 30,
    priceAsOf: "2026-10-30",
    lots: [lot("ZEPH", 300, 22, "2024-01-10")],
    peaks: {
      "1w": peak(31, "2026-10-29"),
      "1m": peak(32, "2026-10-05"),
      "3m": peak(35, "2026-08-18"),
      "1y": peak(38, "2026-03-20"),
      "3y": peak(42, "2024-07-07"),
    },
  },
  {
    ticker: "TIDL",
    name: "Tidal Foods",
    sector: "Consumer Staples",
    supplyChain: "End Markets",
    price: null,
    priceAsOf: null,
    lots: [],
    peaks: {},
  },
  {
    ticker: "EMBR",
    name: "Ember Materials",
    sector: "Materials",
    supplyChain: "End Markets",
    price: 55,
    priceAsOf: "2026-10-30",
    lots: [lot("EMBR", 100, null, "2023-02-01")],
    peaks: {
      "1w": peak(57, "2026-10-28"),
      "1m": peak(58, "2026-10-09"),
      "3m": peak(62, "2026-08-25"),
      "1y": peak(68, "2026-01-20"),
      "3y": peak(75, "2024-10-03"),
    },
  },
  {
    ticker: "NRTH",
    name: "North Rail",
    sector: "Industrials",
    supplyChain: "Service & Other Equipment",
    price: 40,
    priceAsOf: "2026-10-19",
    lots: [lot("NRTH", 150, 30, "2022-05-01")],
    peaks: {
      "1w": peak(41, "2026-10-27"),
      "1m": peak(42, "2026-10-06"),
      "3m": peak(44, "2026-08-15"),
      "1y": peak(48, "2026-02-11"),
      "3y": peak(52, "2024-06-06"),
    },
  },
  {
    ticker: "CIPH",
    name: "Cipher Security",
    sector: "Info Tech",
    supplyChain: "Enterprise Software",
    price: 70,
    priceAsOf: "2026-10-30",
    splitSuspected: true,
    lots: [lot("CIPH", 90, 55, "2023-09-01")],
    peaks: {
      "1w": peak(72, "2026-10-28"),
      "1m": peak(74, "2026-10-07"),
      "3m": peak(78, "2026-08-28"),
      "1y": peak(85, "2026-01-15"),
      "3y": peak(95, "2024-09-12"),
    },
  },
  {
    ticker: "AXIO",
    name: "Axiom Robotics",
    sector: "Unclassified",
    supplyChain: "Unclassified",
    price: 110,
    priceAsOf: "2026-10-30",
    lots: [lot("AXIO", 40, 95, "2024-03-01")],
    peaks: {
      "1w": peak(112, "2026-10-29"),
      "1m": peak(115, "2026-10-03"),
      "3m": peak(120, "2026-08-19"),
      "1y": peak(130, "2026-02-09"),
      "3y": peak(140, "2024-11-11"),
    },
  },
  {
    ticker: "VEGA",
    name: "Vega Retail",
    sector: "Consumer Discretionary",
    supplyChain: "End Markets",
    price: 85,
    priceAsOf: "2026-10-30",
    lots: [lot("VEGA", 70, 78, "2026-10-25")],
    peaks: {
      "1w": peak(88, "2026-10-28"),
      "1m": peak(90, "2026-10-04"),
      "3m": peak(95, "2026-08-21"),
      "1y": peak(100, "2026-03-11"),
      "3y": peak(105, "2024-10-08"),
    },
  },
  {
    ticker: "MOSC",
    name: "Mosaic Industrials",
    sector: "Industrials",
    supplyChain: "Service & Other Equipment",
    price: 60,
    priceAsOf: "2026-10-30",
    lots: [lot("MOSC", 110, 50, "2022-11-01")],
    peaks: {
      "1w": peak(62, "2026-10-29"),
      "1m": peak(63, "2026-10-08"),
      "3m": peak(66, "2026-08-26"),
      "1y": peak(72, "2026-01-19"),
      "3y": peak(80, "2024-08-02"),
    },
  },
  {
    ticker: "KODA",
    name: "Koda Health",
    sector: "Health Care",
    supplyChain: "End Markets",
    price: 130,
    priceAsOf: "2026-10-30",
    lots: [lot("KODA", 55, 80, "2023-05-01")],
    peaks: {
      "1w": peak(132, "2026-10-28"),
      "1m": peak(135, "2026-10-06"),
      "3m": peak(140, "2026-08-24"),
      "1y": peak(150, "2026-02-16"),
      "3y": peak(160, "2024-12-05"),
    },
  },
];

const SAMPLE_ACTIVITY: ActivityEvent[] = [
  { id: "a1", kind: "close", ticker: "TIDL", shares: 80, date: "2026-10-28", note: "Closed position" },
  { id: "a2", kind: "buy", ticker: "VEGA", shares: 70, date: "2026-10-25", note: "New position" },
  { id: "a3", kind: "buy", ticker: "NOVA", shares: 120, date: "2026-10-20", note: "New position" },
  { id: "a4", kind: "buy", ticker: "QNTM", shares: 80, date: "2026-10-12", note: "Bought back after sale" },
  { id: "a5", kind: "sell", ticker: "MOSC", shares: 40, date: "2026-10-08", note: "Partial sale" },
  { id: "a6", kind: "sell", ticker: "QNTM", shares: 60, date: "2026-10-05", note: "Partial sale" },
];

const SAMPLE_LAST_DIFF: UploadDiff = {
  added: [{ ticker: "NOVA", shares: 120, costBasis: 180, acquiredDate: "2026-10-20" }],
  removed: [lot("TIDL", 80, 40, "2022-01-15")],
  changed: [
    {
      before: lot("ZEPH", 400, 22, "2024-01-10"),
      after: { ticker: "ZEPH", shares: 300, costBasis: 22, acquiredDate: "2024-01-10" },
    },
  ],
  unchanged: [],
  errors: [],
  ok: true,
};

function sampleSnapshot(): PortfolioSnapshot {
  return {
    portfolioId: "sample",
    portfolioLabel: "Sample portfolio",
    version: 3,
    holdingsAsOf: "2026-10-30",
    pricesAsOf: "2026-10-30",
    holdings: structuredClone(SAMPLE_HOLDINGS),
    activity: [...SAMPLE_ACTIVITY],
    lastDiff: SAMPLE_LAST_DIFF,
  };
}

function staleSnapshot(): PortfolioSnapshot {
  const snap = sampleSnapshot();
  snap.pricesAsOf = "2026-10-19";
  snap.holdingsAsOf = "2026-09-20";
  for (const h of snap.holdings) {
    if (h.priceAsOf !== null) h.priceAsOf = "2026-10-19";
  }
  return snap;
}

function emptySnapshot(): PortfolioSnapshot {
  return {
    portfolioId: "sample",
    portfolioLabel: "Sample portfolio",
    version: 0,
    holdingsAsOf: null,
    pricesAsOf: null,
    holdings: [],
    activity: [],
    lastDiff: null,
  };
}

export type MockState = "sample" | "stale" | "empty";

export function mockStateFromUrl(search: string): MockState {
  const params = new URLSearchParams(search);
  const v = params.get("portfolioState");
  if (v === "stale" || v === "empty") return v;
  return "sample";
}

/** In-memory store. Apply only mutates this instance; a reload resets. */
export class MockPortfolioStore implements PortfolioStore {
  private snap: PortfolioSnapshot;
  private asOf = MOCK_AS_OF;

  constructor(state: MockState = "sample") {
    this.snap =
      state === "empty"
        ? emptySnapshot()
        : state === "stale"
          ? staleSnapshot()
          : sampleSnapshot();
  }

  async getBrief() {
    return buildBrief(this.snap, this.asOf);
  }

  async getPortfolio() {
    return buildPortfolio(this.snap, this.asOf);
  }

  async getLots(ticker?: string) {
    return buildLots(this.snap, this.asOf, ticker);
  }

  async getAllocation(
    groupBy: "sector" | "supplyChain",
    weighting: "company" | "value",
  ) {
    return buildAllocation(this.snap, groupBy, weighting, this.asOf);
  }

  async getDrawdowns() {
    return buildDrawdowns(this.snap, this.asOf);
  }

  async getHarvest() {
    return buildHarvest(this.snap, this.asOf);
  }

  async previewUpload(csv: string): Promise<UploadDiff> {
    const current = this.snap.holdings.flatMap((h) => h.lots);
    return diffUpload(current, csv);
  }

  async applyUpload(diff: UploadDiff): Promise<void> {
    if (!diff.ok) return;
    const nextLots = applyDiff(
      this.snap.holdings.flatMap((h) => h.lots),
      diff,
    );
    const byTicker = new Map<string, TaxLot[]>();
    for (const l of nextLots) {
      const list = byTicker.get(l.ticker) ?? [];
      list.push(l);
      byTicker.set(l.ticker, list);
    }
    const holdings: HoldingInput[] = [];
    for (const h of this.snap.holdings) {
      holdings.push({ ...h, lots: byTicker.get(h.ticker) ?? [] });
      byTicker.delete(h.ticker);
    }
    for (const [ticker, lots] of byTicker) {
      holdings.push({
        ticker,
        name: ticker,
        sector: "Unclassified",
        supplyChain: "Unclassified",
        price: null,
        priceAsOf: null,
        lots,
        peaks: {},
      });
    }
    const activity: ActivityEvent[] = [...this.snap.activity];
    let n = activity.length + 1;
    for (const row of diff.added) {
      activity.unshift({
        id: `m${n++}`,
        kind: "buy",
        ticker: row.ticker,
        shares: row.shares,
        date: this.asOf,
        note: "Added by upload",
      });
    }
    for (const lot of diff.removed) {
      const remaining = nextLots.filter((l) => l.ticker === lot.ticker);
      activity.unshift({
        id: `m${n++}`,
        kind: remaining.length === 0 ? "close" : "sell",
        ticker: lot.ticker,
        shares: lot.shares,
        date: this.asOf,
        note: "Removed by upload",
      });
    }
    this.snap = {
      ...this.snap,
      holdings,
      activity,
      lastDiff: diff,
      version: this.snap.version + 1,
      holdingsAsOf: this.asOf,
    };
  }

  async refreshPrices(): Promise<void> {
    this.snap = {
      ...this.snap,
      pricesAsOf: this.asOf,
      holdings: this.snap.holdings.map((h) =>
        h.price === null ? h : { ...h, priceAsOf: this.asOf },
      ),
    };
  }
}
