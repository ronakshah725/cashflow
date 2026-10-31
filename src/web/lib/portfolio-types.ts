// Portfolio payload types. These shapes mirror the planned real API
// (GET /api/portfolio, /api/lots, /api/allocation, /api/drawdowns,
// /api/harvest, /api/brief) so the UI never depends on whether the data
// came from the mock store or the real Worker backend.
//
// Money is plain numbers (dollars, not cents) in payloads; formatting to
// a currency string happens only at render time in portfolio-math.

export type FlagKind =
  | "bought-recently"
  | "sold-recently"
  | "trimmed"
  | "closed"
  | "harvest-short"
  | "harvest-long"
  | "wash-risk"
  | "turning-long-term"
  | "deep-drawdown"
  | "overweight"
  | "missing-basis"
  | "stale-price"
  | "possible-split"
  | "unclassified";

export interface Flag {
  kind: FlagKind;
  /** Short chip label, e.g. "Bought recently". */
  label: string;
  /** One plain sentence shown when the chip is tapped. */
  detail: string;
}

export interface TaxLot {
  /** Lot key: ticker:acquiredDate:costBasis (costBasis "?" when unknown). */
  id: string;
  ticker: string;
  shares: number;
  /** Per-share cost basis. Null means the upload did not include one. */
  costBasis: number | null;
  /** YYYY-MM-DD, or "" when the upload did not include a date. */
  acquiredDate: string;
}

export interface ActivityEvent {
  id: string;
  /** "buy" | "sell" | "trim" | "close" */
  kind: "buy" | "sell" | "trim" | "close";
  ticker: string;
  shares: number;
  /** YYYY-MM-DD */
  date: string;
  note: string;
}

export type DrawdownWindow = "1w" | "1m" | "3m" | "1y" | "3y";

export interface DrawdownPoint {
  /** Negative fraction, e.g. -0.28 means 28% below the window peak. */
  pct: number;
  /** Peak price in the window. */
  peak: number;
  /** YYYY-MM-DD of the peak. */
  peakDate: string;
}

/** One holding as the store holds it, before view math. */
export interface HoldingInput {
  ticker: string;
  name: string;
  sector: string;
  supplyChain: string;
  /** Null price means no price data for this ticker. */
  price: number | null;
  /** YYYY-MM-DD of the price, or null when there is no price. */
  priceAsOf: string | null;
  /** True when the backend suspects a split (adjusted vs raw close gap). */
  splitSuspected?: boolean;
  lots: TaxLot[];
  /** Window peaks used for drawdowns (price + date; pct is computed). */
  peaks: Partial<Record<DrawdownWindow, { peak: number; peakDate: string }>>;
}

/** Everything the store knows, in one snapshot. */
export interface PortfolioSnapshot {
  portfolioId: string;
  portfolioLabel: string;
  /** Monotonic upload version; 0 means nothing has ever been uploaded. */
  version: number;
  /** YYYY-MM-DD of the last applied upload, or null when never uploaded. */
  holdingsAsOf: string | null;
  /** YYYY-MM-DD of the cached prices, or null when no prices exist. */
  pricesAsOf: string | null;
  holdings: HoldingInput[];
  /** Most recent first. Drives bought/sold/trimmed/closed flags. */
  activity: ActivityEvent[];
  /** The upload diff that produced the current snapshot, for the UI. */
  lastDiff: UploadDiff | null;
}

export interface PositionView {
  ticker: string;
  name: string;
  sector: string;
  supplyChain: string;
  shares: number;
  price: number | null;
  priceAsOf: string | null;
  value: number;
  /** Unrealized gain across lots with a known basis, or null. */
  gain: number | null;
  flags: Flag[];
}

export interface PortfolioPayload {
  portfolioId: string;
  portfolioLabel: string;
  version: number;
  holdingsAsOf: string | null;
  pricesAsOf: string | null;
  totalValue: number;
  positions: PositionView[];
  closed: PositionView[];
  activity: ActivityEvent[];
  /** True when cached prices are older than the staleness threshold. */
  pricesStale: boolean;
  /** True when holdings are older than the staleness threshold. */
  holdingsStale: boolean;
}

export interface LotView extends TaxLot {
  currentPrice: number | null;
  currentValue: number | null;
  /** Null when basis or price is unknown. */
  gain: number | null;
  /** "short" | "long" | "unknown" */
  term: "short" | "long" | "unknown";
  /** Days held, or null when the acquired date is unknown. */
  daysHeld: number | null;
  flags: Flag[];
}

export interface LotsPayload {
  lots: LotView[];
}

export interface AllocationGroup {
  key: string;
  label: string;
  companies: number;
  value: number;
  pct: number;
  tickers: string[];
}

export interface AllocationPayload {
  groupBy: "sector" | "supplyChain";
  weighting: "company" | "value";
  totalValue: number;
  groups: AllocationGroup[];
}

export interface HoldingDrawdown {
  ticker: string;
  drawdowns: Partial<Record<DrawdownWindow, DrawdownPoint>>;
  /** Worst (most negative) window, for sorting the dip list. */
  worst: { window: DrawdownWindow; pct: number } | null;
}

export interface DrawdownsPayload {
  windows: DrawdownWindow[];
  holdings: HoldingDrawdown[];
  /** Value-weighted average holding drawdown per window. */
  portfolio: Partial<Record<DrawdownWindow, number>>;
}

export interface HarvestCandidate {
  ticker: string;
  lotId: string;
  shares: number;
  /** Negative number: the harvestable loss. */
  loss: number;
  term: "short" | "long";
  washRisk: boolean;
}

export interface HarvestPayload {
  candidates: HarvestCandidate[];
  totalHarvestable: number;
}

export interface BriefPayload {
  portfolioId: string;
  portfolioLabel: string;
  version: number;
  holdingsAsOf: string | null;
  pricesAsOf: string | null;
  totalValue: number;
  positionCount: number;
  /** Summed unrealized gain, or null when no position has a basis. */
  totalGain: number | null;
  /** Positions excluded from totalGain because a lot lacks a basis. */
  gainExcludesMissingBasis: number;
  /** Top 5 holdings by value. */
  topHoldings: { ticker: string; value: number; pct: number }[];
  deepestDrawdowns: { ticker: string; window: DrawdownWindow; pct: number }[];
  harvestableLosses: { ticker: string; loss: number; term: "short" | "long" }[];
  recentActivity: ActivityEvent[];
  /** Every flag in the portfolio, grouped by holding. */
  flags: { ticker: string; flags: Flag[] }[];
  pricesStale: boolean;
  holdingsStale: boolean;
}

/** Read-only store interface. The mock implements it today; the real
 *  Worker backend implements the same methods over fetch tomorrow, and
 *  no UI component changes. Upload preview/apply are async-shaped so
 *  the fetch store can POST an upload through the authed session
 *  without UI changes (the mock resolves immediately). */
export interface PortfolioStore {
  getBrief(): Promise<BriefPayload>;
  getPortfolio(): Promise<PortfolioPayload>;
  getLots(ticker?: string): Promise<LotsPayload>;
  getAllocation(
    groupBy: "sector" | "supplyChain",
    weighting: "company" | "value",
  ): Promise<AllocationPayload>;
  getDrawdowns(): Promise<DrawdownsPayload>;
  getHarvest(): Promise<HarvestPayload>;
  previewUpload(csv: string): Promise<UploadDiff>;
  applyUpload(diff: UploadDiff): Promise<void>;
  /**
   * Triggers a price refresh and resolves when fresh prices are
   * stored. Backend meaning: POST /api/refresh-prices. The mock
   * pretends a refresh just succeeded.
   */
  refreshPrices(): Promise<void>;
}

export interface ParsedLotRow {
  ticker: string;
  shares: number;
  costBasis: number | null;
  acquiredDate: string;
}

export interface CsvParseError {
  line: number;
  message: string;
}

export interface UploadDiff {
  added: ParsedLotRow[];
  removed: TaxLot[];
  changed: {
    before: TaxLot;
    after: ParsedLotRow;
  }[];
  unchanged: TaxLot[];
  errors: CsvParseError[];
  /** True when the diff is safe to apply (no parse errors). */
  ok: boolean;
}
