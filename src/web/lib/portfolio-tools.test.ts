// Tests for the agent tool surface (src/web/lib/portfolio-tools.ts).
// The contract under test: REST and MCP share these exact functions, so
// a tool call must return the same payload as the matching store method,
// defaults must be the documented ones, and bad input must fail loudly.

import { describe, expect, it } from "vitest";
import { MockPortfolioStore } from "./portfolio-mock";
import { dispatchTool, TOOL_CATALOG } from "./portfolio-tools";
import type { AllocationPayload, LotsPayload } from "./portfolio-types";

const store = new MockPortfolioStore("sample");

describe("tool catalog", () => {
  it("covers every read endpoint, nothing else", () => {
    expect(TOOL_CATALOG.map((t) => t.name).sort()).toEqual([
      "get_allocation",
      "get_brief",
      "get_drawdowns",
      "get_harvest",
      "get_lots",
      "get_portfolio",
    ]);
  });
});

describe("dispatchTool", () => {
  it("get_brief matches the store brief", async () => {
    const viaTool = await dispatchTool(store, "get_brief", {});
    const direct = await store.getBrief();
    expect(viaTool).toEqual({ ok: true, result: direct });
  });

  it("get_lots filters by ticker and uppercases it", async () => {
    const res = await dispatchTool(store, "get_lots", { ticker: "nova" });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const lots = res.result as LotsPayload;
      expect(lots.lots.length).toBeGreaterThan(0);
      expect(lots.lots.every((l) => l.ticker === "NOVA")).toBe(true);
    }
  });

  it("get_allocation defaults to sector by value", async () => {
    const res = await dispatchTool(store, "get_allocation", {});
    expect(res.ok).toBe(true);
    if (res.ok) {
      const a = res.result as AllocationPayload;
      expect(a.groupBy).toBe("sector");
      expect(a.weighting).toBe("value");
    }
  });

  it("get_allocation rejects an unknown grouping", async () => {
    const res = await dispatchTool(store, "get_allocation", { groupBy: "planet" });
    expect(res.ok).toBe(false);
  });

  it("non-object arguments are errors, not silent defaults", async () => {
    const res = await dispatchTool(store, "get_lots", "NOVA");
    expect(res.ok).toBe(false);
  });

  it("unknown tools fail instead of guessing", async () => {
    const res = await dispatchTool(store, "delete_everything", {});
    expect(res.ok).toBe(false);
  });
});
