// Pure portfolio math. No React, no fetch, no Date.now: every function
// that needs "today" takes it as an explicit asOf (YYYY-MM-DD) so tests
// are deterministic and the real backend can reuse these exact functions.
//
// Upload semantics: a CSV is a FULL snapshot of the portfolio. Lots in
// the current store but missing from the CSV are treated as removed
// (sold or closed) and shown in the diff preview before anything applies.

import type {
  ActivityEvent,
  AllocationGroup,
  AllocationPayload,
  BriefPayload,
  CsvParseError,
  DrawdownPoint,
  DrawdownWindow,
  Flag,
  FlagKind,
  HarvestCandidate,
  HarvestPayload,
  HoldingDrawdown,
  HoldingInput,
  LotView,
  LotsPayload,
  ParsedLotRow,
  PortfolioPayload,
  PortfolioSnapshot,
  PositionView,
  TaxLot,
  UploadDiff,
} from "./portfolio-types";

export const WINDOWS: DrawdownWindow[] = ["1w", "1m", "3m", "1y", "3y"];
export const WINDOW_LABELS: Record<DrawdownWindow, string> = {
  "1w": "1 week",
  "1m": "1 month",
  "3m": "3 months",
  "1y": "1 year",
  "3y": "3 years",
};
export const RECENT_DAYS = 30;
export const STALE_PRICE_DAYS = 7;
export const STALE_HOLDINGS_DAYS = 14;
export const OVERWEIGHT_PCT = 0.1;
export const DEEP_DRAWDOWN_PCT = -0.2;
export const TURNING_LONG_TERM_DAYS = 30;
export const LONG_TERM_DAYS = 365;

/* ---------- dates and money ---------- */

export function parseDate(s: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  const t = Date.parse(s + "T00:00:00Z");
  if (Number.isNaN(t)) return null;
  // Strict component check: JS rolls 2026-02-30 over to Mar 2, which
  // would silently shift term math. Reject impossible dates outright.
  const dt = new Date(t);
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() + 1 !== m ||
    dt.getUTCDate() !== d
  ) {
    return null;
  }
  return t;
}

export function daysBetween(from: string, to: string): number | null {
  const a = parseDate(from);
  const b = parseDate(to);
  if (a === null || b === null) return null;
  return Math.round((b - a) / 86400000);
}

export function isValidDate(s: string): boolean {
  return parseDate(s) !== null;
}

/** YYYY-MM-DD plus N days, UTC-safe. Null when the input is not a date. */
export function addDaysISO(s: string, days: number): string | null {
  const t = parseDate(s);
  if (t === null) return null;
  return new Date(t + days * 86400000).toISOString().slice(0, 10);
}

/** Whole dollars with a sign, matching the cash-flow formatter style. */
export function money(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`;
}

export function money2(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function pct(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${(n * 100).toFixed(1)}%`;
}

/** Percent with no plus sign, for weights: a weight is not a gain. */
export function pctUnsigned(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export function fmtDate(s: string): string {
  const t = parseDate(s);
  if (t === null) return s;
  return new Date(t).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function lotKey(ticker: string, acquiredDate: string, costBasis: number | null): string {
  return `${ticker}:${acquiredDate || "?"}:${costBasis === null ? "?" : String(costBasis)}`;
}

export function lotId(l: TaxLot): string {
  return lotKey(l.ticker, l.acquiredDate, l.costBasis);
}

/* ---------- CSV parsing ---------- */

const HEADER_ALIASES: Record<string, string> = {
  ticker: "ticker",
  symbol: "ticker",
  shares: "shares",
  sharesheld: "shares",
  quantity: "shares",
  costbasis: "costBasis",
  cost_basis: "costBasis",
  cost: "costBasis",
  basis: "costBasis",
  acquireddate: "acquiredDate",
  acquired_date: "acquiredDate",
  date: "acquiredDate",
  purchasedate: "acquiredDate",
};

function normHeader(h: string): string {
  return stripQuotes(h).trim().toLowerCase().replace(/[\s_-]+/g, "");
}

/**
 * Strip one pair of surrounding double quotes from a CSV cell, with
 * "" unescaped to ". Brokerage exports quote cells; without this a
 * quoted ticker parses as a junk position. Note: commas inside quoted
 * cells still split, since parsing is a plain split on commas.
 */
function stripQuotes(c: string): string {
  const t = c.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
    return t.slice(1, -1).replace(/""/g, '"');
  }
  return t;
}

/**
 * Parse an upload CSV. Header row required; column names are flexible
 * (ticker/symbol, shares, costBasis/cost, acquiredDate/date). Blank lines
 * are skipped. Rows with bad shares, bad basis, or bad dates become
 * errors instead of silently dropping, and the diff is not applicable
 * while any error exists.
 */
export function parseUploadCsv(
  csv: string,
): { rows: ParsedLotRow[]; errors: CsvParseError[] } {
  const rows: ParsedLotRow[] = [];
  const errors: CsvParseError[] = [];
  const lines = csv.split(/\r?\n/);
  let header: Record<string, number> | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cells = line.split(",").map((c) => stripQuotes(c));
    if (header === null) {
      const mapped: Record<string, number> = {};
      for (let j = 0; j < cells.length; j++) {
        const canon = HEADER_ALIASES[normHeader(cells[j])];
        if (canon && !(canon in mapped)) mapped[canon] = j;
      }
      if (!("ticker" in mapped) || !("shares" in mapped)) {
        errors.push({
          line: i + 1,
          message: "Header must include ticker and shares columns.",
        });
        return { rows: [], errors };
      }
      header = mapped;
      continue;
    }
    const lineNo = i + 1;
    const ticker = (cells[header.ticker] ?? "").toUpperCase();
    if (!ticker) {
      errors.push({ line: lineNo, message: "Missing ticker." });
      continue;
    }
    const shares = Number(cells[header.shares]);
    if (!Number.isFinite(shares) || shares <= 0) {
      errors.push({ line: lineNo, message: `Bad shares for ${ticker}.` });
      continue;
    }
    let costBasis: number | null = null;
    if ("costBasis" in header) {
      const raw = cells[header.costBasis] ?? "";
      if (raw !== "") {
        const v = Number(raw);
        if (!Number.isFinite(v) || v < 0) {
          errors.push({ line: lineNo, message: `Bad cost basis for ${ticker}.` });
          continue;
        }
        costBasis = v;
      }
    }
    let acquiredDate = "";
    if ("acquiredDate" in header) {
      const raw = cells[header.acquiredDate] ?? "";
      if (raw !== "" && !isValidDate(raw)) {
        errors.push({ line: lineNo, message: `Bad acquired date for ${ticker}.` });
        continue;
      }
      acquiredDate = raw;
    }
    const key = lotKey(ticker, acquiredDate, costBasis);
    const existing = rows.find(
      (r) => lotKey(r.ticker, r.acquiredDate, r.costBasis) === key,
    );
    if (existing) {
      existing.shares += shares;
    } else {
      rows.push({ ticker, shares, costBasis, acquiredDate });
    }
  }
  if (header === null) {
    errors.push({ line: 1, message: "Empty file: expected a header row." });
  }
  return { rows, errors };
}

/* ---------- upload diff ---------- */

/**
 * Diff incoming rows against current lots.
 *
 * Matching rule (decided explicitly, so a basis typo fix stays a typo
 * fix): lots match by ticker + acquired date, and cost basis is a
 * changed field, not part of identity. A row with the same ticker and
 * date but a different basis reads as one changed lot, not a removal
 * plus an addition — so applying it fires no buy/sell activity events
 * and no spurious bought/sold/wash flags. Exact ticker:date:basis
 * matches still win first; the date fallback only catches basis edits.
 */
export function diffLots(current: TaxLot[], incoming: ParsedLotRow[]): UploadDiff {
  const byKey = new Map<string, TaxLot>();
  for (const lot of current) byKey.set(lotId(lot), lot);
  const matched = new Set<TaxLot>();
  const added: ParsedLotRow[] = [];
  const changed: UploadDiff["changed"] = [];
  const unchanged: TaxLot[] = [];
  for (const row of incoming) {
    const key = lotKey(row.ticker, row.acquiredDate, row.costBasis);
    const before = byKey.get(key);
    if (before && !matched.has(before)) {
      matched.add(before);
      if (before.shares !== row.shares) {
        changed.push({ before, after: row });
      } else {
        unchanged.push(before);
      }
      continue;
    }
    const sameDate = current.find(
      (l) =>
        !matched.has(l) &&
        l.ticker === row.ticker &&
        l.acquiredDate === row.acquiredDate,
    );
    if (sameDate) {
      matched.add(sameDate);
      changed.push({ before: sameDate, after: row });
    } else {
      added.push(row);
    }
  }
  const removed = current.filter((lot) => !matched.has(lot));
  return { added, removed, changed, unchanged, errors: [], ok: true };
}

/** Diff a raw CSV against the current lots, including parse errors. */
export function diffUpload(current: TaxLot[], csv: string): UploadDiff {
  const { rows, errors } = parseUploadCsv(csv);
  if (errors.length > 0) {
    return { added: [], removed: [], changed: [], unchanged: [], errors, ok: false };
  }
  return diffLots(current, rows);
}

/** Apply an approved diff to a lot list. Pure: returns the new list. */
export function applyDiff(current: TaxLot[], diff: UploadDiff): TaxLot[] {
  if (!diff.ok) return current;
  const removedKeys = new Set(diff.removed.map((l) => lotId(l)));
  const changedKeys = new Map(
    diff.changed.map((c) => [
      lotId(c.before),
      {
        ticker: c.after.ticker,
        shares: c.after.shares,
        costBasis: c.after.costBasis,
        acquiredDate: c.after.acquiredDate,
        // Identity follows the new values: a basis correction renames
        // the lot, so lot detail links keep resolving after apply.
        id: lotKey(c.after.ticker, c.after.acquiredDate, c.after.costBasis),
      } as TaxLot,
    ]),
  );
  const next: TaxLot[] = [];
  for (const lot of current) {
    const key = lotId(lot);
    if (removedKeys.has(key)) continue;
    if (changedKeys.has(key)) next.push(changedKeys.get(key)!);
    else next.push(lot);
  }
  for (const row of diff.added) {
    next.push({
      id: lotKey(row.ticker, row.acquiredDate, row.costBasis),
      ticker: row.ticker,
      shares: row.shares,
      costBasis: row.costBasis,
      acquiredDate: row.acquiredDate,
    });
  }
  return next;
}

/* ---------- lots ---------- */

export function lotTerm(
  acquiredDate: string,
  asOf: string,
): { term: "short" | "long" | "unknown"; daysHeld: number | null } {
  if (!acquiredDate) return { term: "unknown", daysHeld: null };
  const days = daysBetween(acquiredDate, asOf);
  if (days === null || days < 0) return { term: "unknown", daysHeld: null };
  // Tax rule: MORE than one year. Exactly 365 days held is still
  // short-term; day 366 is the first long-term day.
  return { term: days > LONG_TERM_DAYS ? "long" : "short", daysHeld: days };
}

/** Days from today until a lot turns long-term (day 366). */
function daysUntilLongTerm(daysHeld: number): number {
  return LONG_TERM_DAYS + 1 - daysHeld;
}

export function lotGain(
  lot: TaxLot,
  price: number | null,
): number | null {
  if (lot.costBasis === null || price === null) return null;
  // Round to cents at the computation boundary: raw float math can
  // leave a zero-gain lot at -1e-13, which reads as a loss.
  const rounded = Math.round((price - lot.costBasis) * lot.shares * 100) / 100;
  return rounded === 0 ? 0 : rounded;
}

/* ---------- flags ---------- */

/**
 * Severity rank for one flag kind, lowest first. Used to order the
 * summary's "Flags" list so action items surface before informational
 * flags. Unknown kinds sort last.
 */
export function flagSeverity(kind: FlagKind): number {
  const rank: Record<FlagKind, number> = {
    "wash-risk": 0,
    "harvest-short": 1,
    "harvest-long": 1,
    "deep-drawdown": 2,
    overweight: 3,
    "stale-price": 4,
    "missing-basis": 5,
    "possible-split": 6,
    "turning-long-term": 7,
    unclassified: 8,
    "bought-recently": 9,
    "sold-recently": 9,
    trimmed: 10,
    closed: 11,
  };
  return rank[kind] ?? 99;
}

function flag(kind: FlagKind, label: string, detail: string): Flag {
  return { kind, label, detail };
}

/**
 * Wash-sale pair check, anchored to each sale date: a sale counts as
 * wash-entangled when any buy (activity) or any lot acquisition falls
 * within 30 days before or after that sale. Anchoring to the sale (not
 * to asOf) catches pairs whose sale itself is older than 30 days, e.g.
 * a buy 24 days before an older sale. The flag is conservative: it
 * signals the holding has a wash-sale pair, not a guarantee that a new
 * sale today is disallowed.
 */
export function hasWashSalePair(
  buys: ActivityEvent[],
  sells: ActivityEvent[],
  lots: TaxLot[],
): boolean {
  return sells.some(
    (sale) =>
      buys.some((b) => {
        const d = daysBetween(sale.date, b.date);
        return d !== null && Math.abs(d) <= RECENT_DAYS;
      }) ||
      lots.some((l) => {
        if (!l.acquiredDate) return false;
        const d = daysBetween(sale.date, l.acquiredDate);
        return d !== null && Math.abs(d) <= RECENT_DAYS;
      }),
  );
}

export interface FlagContext {
  asOf: string;
  totalValue: number;
  activity: ActivityEvent[];
  latestDiff: UploadDiff | null;
  /** Worst drawdown plus the window that produced it, for the label. */
  worstDrawdown: { pct: number; window: DrawdownWindow } | null;
}

/**
 * Compute every flag for one position. Flags are derived from data, never
 * stored, so a re-upload or a price refresh recomputes them for free.
 */
export function computeFlags(
  ticker: string,
  shares: number,
  value: number,
  priceAsOf: string | null,
  lots: TaxLot[],
  price: number | null,
  sector: string,
  splitSuspected: boolean,
  ctx: FlagContext,
): Flag[] {
  const flags: Flag[] = [];
  const { asOf, totalValue, activity, latestDiff, worstDrawdown } = ctx;
  const withinRecent = (date: string): boolean => {
    const d = daysBetween(date, asOf);
    return d !== null && d >= 0 && d <= RECENT_DAYS;
  };

  if (shares === 0) {
    flags.push(
      flag("closed", "Closed position", "This position was fully sold; it holds no shares."),
    );
    return flags;
  }

  const buys = activity.filter((e) => e.ticker === ticker && e.kind === "buy");
  const sells = activity.filter((e) => e.ticker === ticker && e.kind === "sell");
  if (buys.some((e) => withinRecent(e.date))) {
    const latest = buys.filter((e) => withinRecent(e.date)).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    flags.push(
      flag("bought-recently", "Bought recently", `Shares were bought on ${fmtDate(latest.date)}. Period: last ${RECENT_DAYS} days.`),
    );
  }
  if (sells.some((e) => withinRecent(e.date))) {
    const latest = sells.filter((e) => withinRecent(e.date)).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    flags.push(
      flag("sold-recently", "Sold recently", `Shares were sold on ${fmtDate(latest.date)}. Period: last ${RECENT_DAYS} days.`),
    );
  }
  if (latestDiff) {
    const trimmed = latestDiff.changed.find(
      (c) => c.before.ticker === ticker && c.after.shares < c.before.shares,
    );
    if (trimmed) {
      flags.push(
        flag(
          "trimmed",
          "Trimmed",
          `The latest upload reduced this position from ${trimmed.before.shares} to ${trimmed.after.shares} shares.`,
        ),
      );
    }
  }
  if (lots.some((l) => l.costBasis === null)) {
    flags.push(
      flag(
        "missing-basis",
        "Missing cost basis",
        "At least one lot has no cost basis, so its gain cannot be computed.",
      ),
    );
  }
  if (priceAsOf !== null) {
    const age = daysBetween(priceAsOf, asOf);
    if (age !== null && age > STALE_PRICE_DAYS) {
      flags.push(
        flag("stale-price", "Stale price", `The last price is from ${fmtDate(priceAsOf)}, more than ${STALE_PRICE_DAYS} days old.`),
      );
    }
  } else if (price === null) {
    flags.push(
      flag("stale-price", "No price", "No price data is available for this holding."),
    );
  }
  if (splitSuspected) {
    flags.push(
      flag(
        "possible-split",
        "Possible split",
        "Adjusted and raw closes disagree, which usually means a split. Verify the share count on the next upload.",
      ),
    );
  }
  if (sector === "Unclassified") {
    flags.push(
      flag(
        "unclassified",
        "Unclassified",
        "No sector or supply-chain map entry exists yet. Tap to map it manually.",
      ),
    );
  }
  if (totalValue > 0 && value / totalValue > OVERWEIGHT_PCT) {
    flags.push(
      flag(
        "overweight",
        "Overweight",
        `This holding is ${pctUnsigned(value / totalValue)} of the portfolio, above the ${Math.round(OVERWEIGHT_PCT * 100)}% concentration line.`,
      ),
    );
  }
  if (worstDrawdown !== null && worstDrawdown.pct <= DEEP_DRAWDOWN_PCT) {
    flags.push(
      flag(
        "deep-drawdown",
        `Deep drawdown (${worstDrawdown.window})`,
        `This holding is ${pct(worstDrawdown.pct)} below its ${worstDrawdown.window} peak.`,
      ),
    );
  }
  if (hasWashSalePair(buys, sells, lots)) {
    flags.push(
      flag(
        "wash-risk",
        "Wash-sale risk",
        "Shares were sold and bought back within 30 days of each other. A loss on the sale may be disallowed.",
      ),
    );
  }
  const turning = lots.find((l) => {
    if (l.costBasis === null || price === null) return false;
    const { term, daysHeld } = lotTerm(l.acquiredDate, asOf);
    if (term !== "short" || daysHeld === null) return false;
    const gain = lotGain(l, price);
    return gain !== null && gain > 0 && daysUntilLongTerm(daysHeld) <= TURNING_LONG_TERM_DAYS;
  });
  if (turning) {
    const { daysHeld } = lotTerm(turning.acquiredDate, asOf);
    const toGo = daysHeld === null ? null : daysUntilLongTerm(daysHeld);
    const turnsDate = addDaysISO(turning.acquiredDate, LONG_TERM_DAYS + 1);
    flags.push(
      flag(
        "turning-long-term",
        "Turning long-term soon",
        `A gaining lot turns long-term in ${toGo ?? "?"} days${turnsDate ? `, on ${fmtDate(turnsDate)}` : ""}. Selling after that date is taxed at long-term rates.`,
      ),
    );
  }
  for (const lot of lots) {
    const gain = lotGain(lot, price);
    if (gain === null || gain >= 0) continue;
    const { term } = lotTerm(lot.acquiredDate, asOf);
    if (term === "short") {
      flags.push(
        flag("harvest-short", "Harvestable loss (short)", `A short-term lot is down ${money(-gain)}. Selling realizes a short-term loss. Short-term losses offset short-term gains first; harvesting only helps against realized gains or limited income.`),
      );
      break;
    }
  }
  for (const lot of lots) {
    const gain = lotGain(lot, price);
    if (gain === null || gain >= 0) continue;
    const { term } = lotTerm(lot.acquiredDate, asOf);
    if (term === "long") {
      flags.push(
        flag("harvest-long", "Harvestable loss (long)", `A long-term lot is down ${money(-gain)}. Selling realizes a long-term loss. Long-term losses offset long-term gains first; harvesting only helps against realized gains or limited income.`),
      );
      break;
    }
  }
  return flags;
}

/* ---------- snapshot views ---------- */

/**
 * Total unrealized gain across positions with a computable gain.
 * Null when no position has a cost basis, so the hero shows no change
 * line instead of a misleading zero.
 */
export function totalGain(positions: PositionView[]): number | null {
  let sum: number | null = null;
  for (const p of positions) {
    if (p.gain === null) continue;
    sum = (sum ?? 0) + p.gain;
  }
  return sum;
}

function positionShares(h: HoldingInput): number {
  return h.lots.reduce((s, l) => s + l.shares, 0);
}

function worstDrawdownFor(
  h: HoldingInput,
  price: number | null,
): { pct: number; window: DrawdownWindow } | null {
  if (price === null) return null;
  let worst: { pct: number; window: DrawdownWindow } | null = null;
  for (const w of WINDOWS) {
    const peak = h.peaks[w];
    if (!peak || peak.peak <= 0) continue;
    const d = price / peak.peak - 1;
    if (worst === null || d < worst.pct) worst = { pct: d, window: w };
  }
  return worst;
}

export function buildPositions(
  snap: PortfolioSnapshot,
  asOf: string,
): { active: PositionView[]; closed: PositionView[]; totalValue: number } {
  const withValue = snap.holdings.map((h) => {
    const shares = positionShares(h);
    const value = h.price === null ? 0 : h.price * shares;
    return { h, shares, value };
  });
  const totalValue = withValue.reduce((s, p) => s + p.value, 0);
  const ctx: Omit<FlagContext, "worstDrawdown"> = {
    asOf,
    totalValue,
    activity: snap.activity,
    latestDiff: snap.lastDiff,
  };
  const views: PositionView[] = withValue.map(({ h, shares, value }) => {
    const gain = h.lots.reduce<number | null>((acc, lot) => {
      const g = lotGain(lot, h.price);
      if (g === null) return acc;
      return (acc ?? 0) + g;
    }, null);
    const flags = computeFlags(
      h.ticker,
      shares,
      value,
      h.priceAsOf,
      h.lots,
      h.price,
      h.sector,
      !!h.splitSuspected,
      { ...ctx, worstDrawdown: worstDrawdownFor(h, h.price) },
    );
    return {
      ticker: h.ticker,
      name: h.name,
      sector: h.sector,
      supplyChain: h.supplyChain,
      shares,
      price: h.price,
      priceAsOf: h.priceAsOf,
      value,
      gain,
      flags,
    };
  });
  return {
    active: views.filter((v) => v.shares > 0),
    closed: views.filter((v) => v.shares === 0),
    totalValue,
  };
}

export function buildPortfolio(
  snap: PortfolioSnapshot,
  asOf: string,
): PortfolioPayload {
  const { active, closed, totalValue } = buildPositions(snap, asOf);
  // Null pricesAsOf means no prices exist at all, which reads as stale:
  // otherwise a priceless portfolio shows no banner even though every
  // holding carries a "No price" flag. (The empty portfolio returns
  // before banners render, so this never fires on a fresh account.)
  const pricesStale =
    snap.pricesAsOf === null ||
    (() => {
      const age = daysBetween(snap.pricesAsOf!, asOf);
      return age !== null && age > STALE_PRICE_DAYS;
    })();
  const holdingsStale =
    snap.holdingsAsOf !== null &&
    (() => {
      const age = daysBetween(snap.holdingsAsOf, asOf);
      return age !== null && age > STALE_HOLDINGS_DAYS;
    })();
  return {
    portfolioId: snap.portfolioId,
    portfolioLabel: snap.portfolioLabel,
    version: snap.version,
    holdingsAsOf: snap.holdingsAsOf,
    pricesAsOf: snap.pricesAsOf,
    totalValue,
    positions: active,
    closed,
    activity: snap.activity,
    pricesStale,
    holdingsStale,
  };
}

export function buildLots(
  snap: PortfolioSnapshot,
  asOf: string,
  ticker?: string,
): LotsPayload {
  const lots: LotView[] = [];
  for (const h of snap.holdings) {
    if (ticker && h.ticker !== ticker) continue;
    const holdingWash = hasWashSalePair(
      snap.activity.filter((e) => e.ticker === h.ticker && e.kind === "buy"),
      snap.activity.filter((e) => e.ticker === h.ticker && e.kind === "sell"),
      h.lots,
    );
    for (const lot of h.lots) {
      const gain = lotGain(lot, h.price);
      const { term, daysHeld } = lotTerm(lot.acquiredDate, asOf);
      const flags: Flag[] = [];
      if (lot.costBasis === null) {
        flags.push(
          flag("missing-basis", "Missing cost basis", "This lot has no cost basis, so its gain cannot be computed."),
        );
      }
      // Unknown term never reads as short-term: the harvest flag is
      // term-gated, matching buildHarvest, which skips unknown terms.
      if (gain !== null && gain < 0 && (term === "short" || term === "long")) {
        flags.push(
          flag(
            term === "long" ? "harvest-long" : "harvest-short",
            term === "long" ? "Harvestable loss (long)" : "Harvestable loss (short)",
            `Selling this lot realizes a ${term}-term loss of ${money(-gain)}. ${term === "long" ? "Long" : "Short"}-term losses offset ${term}-term gains first; harvesting only helps against realized gains or limited income.`,
          ),
        );
      }
      if (gain !== null && gain < 0 && holdingWash) {
        flags.push(
          flag(
            "wash-risk",
            "Wash-sale risk",
            "This holding has a sale and repurchase within 30 days of each other, so a loss on a new sale may be disallowed.",
          ),
        );
      }
      if (term === "short" && daysHeld !== null && gain !== null && gain > 0) {
        const toGo = daysUntilLongTerm(daysHeld);
        if (toGo <= TURNING_LONG_TERM_DAYS) {
          const turnsDate = addDaysISO(lot.acquiredDate, LONG_TERM_DAYS + 1);
          flags.push(
            flag(
              "turning-long-term",
              "Turning long-term soon",
              `This gaining lot turns long-term in ${toGo} days${turnsDate ? `, on ${fmtDate(turnsDate)}` : ""}.`,
            ),
          );
        }
      }
      lots.push({
        ...lot,
        currentPrice: h.price,
        currentValue: h.price === null ? null : h.price * lot.shares,
        gain,
        term,
        daysHeld,
        flags,
      });
    }
  }
  return { lots };
}

export function buildAllocation(
  snap: PortfolioSnapshot,
  groupBy: "sector" | "supplyChain",
  weighting: "company" | "value",
  asOf: string,
): AllocationPayload {
  const { active, totalValue } = buildPositions(snap, asOf);
  const groups = new Map<string, AllocationGroup>();
  for (const p of active) {
    const key = groupBy === "sector" ? p.sector : p.supplyChain;
    const g = groups.get(key) ?? {
      key,
      label: key,
      companies: 0,
      value: 0,
      pct: 0,
      tickers: [],
    };
    g.companies += 1;
    g.value += p.value;
    g.tickers.push(p.ticker);
    groups.set(key, g);
  }
  const list = [...groups.values()];
  if (weighting === "value") {
    for (const g of list) g.pct = totalValue > 0 ? g.value / totalValue : 0;
    list.sort((a, b) => b.value - a.value);
  } else {
    const total = list.reduce((s, g) => s + g.companies, 0);
    for (const g of list) g.pct = total > 0 ? g.companies / total : 0;
    list.sort((a, b) => b.companies - a.companies);
  }
  return { groupBy, weighting, totalValue, groups: list };
}

export function buildDrawdowns(
  snap: PortfolioSnapshot,
  asOf: string,
): import("./portfolio-types").DrawdownsPayload {
  const { active } = buildPositions(snap, asOf);
  const holdings: HoldingDrawdown[] = snap.holdings
    .filter((h) => positionShares(h) > 0 && h.price !== null)
    .map((h) => {
      const drawdowns: Partial<Record<DrawdownWindow, DrawdownPoint>> = {};
      let worst: { window: DrawdownWindow; pct: number } | null = null;
      for (const w of WINDOWS) {
        const peak = h.peaks[w];
        if (!peak || peak.peak <= 0 || h.price === null) continue;
        const pctVal = h.price / peak.peak - 1;
        drawdowns[w] = { pct: pctVal, peak: peak.peak, peakDate: peak.peakDate };
        if (worst === null || pctVal < worst.pct) worst = { window: w, pct: pctVal };
      }
      return { ticker: h.ticker, drawdowns, worst };
    });
  const portfolio: Partial<Record<DrawdownWindow, number>> = {};
  for (const w of WINDOWS) {
    let num = 0;
    let den = 0;
    for (const h of holdings) {
      const d = h.drawdowns[w];
      if (!d) continue;
      const pos = active.find((p) => p.ticker === h.ticker);
      const value = pos ? pos.value : 0;
      num += d.pct * value;
      den += value;
    }
    if (den > 0) portfolio[w] = num / den;
  }
  return { windows: WINDOWS, holdings, portfolio };
}

export function buildHarvest(
  snap: PortfolioSnapshot,
  asOf: string,
): HarvestPayload {
  const { lots } = buildLots(snap, asOf);
  const candidates: HarvestCandidate[] = [];
  for (const lot of lots) {
    if (lot.gain === null || lot.gain >= 0 || lot.term === "unknown") continue;
    const holding = snap.holdings.find((h) => h.ticker === lot.ticker);
    // Sale-anchored, like the holding flag: any sale with a buy or lot
    // acquisition within 30 days of that sale date, not of asOf.
    const washRisk = hasWashSalePair(
      snap.activity.filter((e) => e.ticker === lot.ticker && e.kind === "buy"),
      snap.activity.filter((e) => e.ticker === lot.ticker && e.kind === "sell"),
      holding ? holding.lots : [],
    );
    candidates.push({
      ticker: lot.ticker,
      lotId: lot.id,
      shares: lot.shares,
      loss: lot.gain,
      term: lot.term,
      washRisk,
    });
  }
  candidates.sort((a, b) => a.loss - b.loss);
  return {
    candidates,
    totalHarvestable: candidates.reduce((s, c) => s + c.loss, 0),
  };
}

export function buildBrief(
  snap: PortfolioSnapshot,
  asOf: string,
): BriefPayload {
  const portfolio = buildPortfolio(snap, asOf);
  const drawdowns = buildDrawdowns(snap, asOf);
  const harvest = buildHarvest(snap, asOf);
  const topHoldings = [...portfolio.positions]
    .sort((a, b) => b.value - a.value)
    .slice(0, 5)
    .map((p) => ({
      ticker: p.ticker,
      value: p.value,
      pct: portfolio.totalValue > 0 ? p.value / portfolio.totalValue : 0,
    }));
  const deepestDrawdowns = drawdowns.holdings
    .filter((h) => h.worst !== null)
    .map((h) => ({ ticker: h.ticker, window: h.worst!.window, pct: h.worst!.pct }))
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 5);
  return {
    portfolioId: snap.portfolioId,
    portfolioLabel: snap.portfolioLabel,
    version: snap.version,
    holdingsAsOf: snap.holdingsAsOf,
    pricesAsOf: snap.pricesAsOf,
    totalValue: portfolio.totalValue,
    positionCount: portfolio.positions.length,
    // Summed gains carry the same qualification as the hero line: a
    // position with a missing-basis lot is excluded from the sum.
    totalGain: totalGain(portfolio.positions),
    gainExcludesMissingBasis: portfolio.positions.filter((p) =>
      p.flags.some((f) => f.kind === "missing-basis"),
    ).length,
    topHoldings,
    deepestDrawdowns,
    harvestableLosses: harvest.candidates.slice(0, 5).map((c) => ({
      ticker: c.ticker,
      loss: c.loss,
      term: c.term,
    })),
    recentActivity: snap.activity.slice(0, 6),
    flags: portfolio.positions
      .filter((p) => p.flags.length > 0)
      .map((p) => ({ ticker: p.ticker, flags: p.flags })),
    pricesStale: portfolio.pricesStale,
    holdingsStale: portfolio.holdingsStale,
  };
}
