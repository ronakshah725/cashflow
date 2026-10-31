// Agent tool surface: the single shared read layer for the REST API and
// the MCP server.
//
// DESIGN (implementation lands with the backend, after UX approval):
// - REST endpoints (GET /api/portfolio, /api/lots, /api/allocation,
//   /api/drawdowns, /api/harvest, /api/brief) and MCP tools call these
//   same dispatch functions. No read logic is duplicated per transport.
// - MCP transport: Streamable HTTP on the same Worker (POST /mcp).
// - Auth, both transports: the same read-only API key, sent as an
//   Authorization Bearer header. Never in a URL, never in git.
// - Scope, both transports: read-only. There is deliberately no write
//   tool in v1; uploads stay in the authed UI session.
// - Any MCP-capable agent can use these tools, not just Muse. Tool
//   outputs are the exact REST payloads, so an agent written against
//   one transport works against the other.
//
// This file is transport-free on purpose: it validates tool input and
// dispatches to a PortfolioStore. The mock store implements that store
// today; the Worker backend will implement it over KV tomorrow.

import type { PortfolioStore } from "./portfolio-types";

export interface ToolSpec {
  name: string;
  description: string;
  /** Minimal JSON-schema-style input shape (no external validator). */
  inputSchema: {
    type: "object";
    properties: Record<string, { type: string; enum?: string[]; description: string }>;
    additionalProperties: false;
  };
}

export const TOOL_CATALOG: ToolSpec[] = [
  {
    name: "get_portfolio",
    description:
      "Current portfolio: positions with value, gain, and flags, closed positions, recent activity, as-of dates, and version.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_lots",
    description:
      "Tax lots with gain, loss, and short/long term. Pass ticker for one holding, or omit it for all lots.",
    inputSchema: {
      type: "object",
      properties: {
        ticker: { type: "string", description: "Holding ticker, e.g. NOVA. Omit for all lots." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_allocation",
    description:
      "Allocation grouped by sector or supply chain, weighted by company count or by value.",
    inputSchema: {
      type: "object",
      properties: {
        groupBy: {
          type: "string",
          enum: ["sector", "supplyChain"],
          description: "Grouping. Default sector.",
        },
        weighting: {
          type: "string",
          enum: ["company", "value"],
          description: "Weighting. Default value.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_drawdowns",
    description:
      "Drawdown from peak per holding and portfolio-wide, for 1 week, 1 month, 3 months, 1 year, and 3 years.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_harvest",
    description:
      "Harvest candidates ranked by loss size, with term and wash-sale risk flags.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_brief",
    description:
      "One-call summary for agent analysis: value, allocation, top holdings, deepest drawdowns, harvestable losses, recent activity, all flags, as-of dates, version.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];

export type ToolResult =
  | { ok: true; result: unknown }
  | { ok: false; error: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function enumArg(
  args: Record<string, unknown>,
  key: string,
  allowed: string[],
  fallback: string,
): string | null {
  const v = args[key];
  if (v === undefined) return fallback;
  if (typeof v !== "string" || !allowed.includes(v)) return null;
  return v;
}

/**
 * Dispatch one tool call against a store. Returns the exact payload the
 * matching REST endpoint returns. Unknown tools and invalid arguments
 * are errors, never silent defaults beyond the documented ones.
 */
export async function dispatchTool(
  store: PortfolioStore,
  name: string,
  args: unknown,
): Promise<ToolResult> {
  if (args !== undefined && !isRecord(args)) {
    return { ok: false, error: "Arguments must be an object." };
  }
  const input = isRecord(args) ? args : {};
  switch (name) {
    case "get_portfolio":
      return { ok: true, result: await store.getPortfolio() };
    case "get_brief":
      return { ok: true, result: await store.getBrief() };
    case "get_drawdowns":
      return { ok: true, result: await store.getDrawdowns() };
    case "get_harvest":
      return { ok: true, result: await store.getHarvest() };
    case "get_lots": {
      const ticker = input["ticker"];
      if (ticker !== undefined && (typeof ticker !== "string" || ticker.trim() === "")) {
        return { ok: false, error: "ticker must be a non-empty string." };
      }
      const lots = await store.getLots(
        ticker === undefined ? undefined : String(ticker).trim().toUpperCase(),
      );
      return { ok: true, result: lots };
    }
    case "get_allocation": {
      const groupBy = enumArg(input, "groupBy", ["sector", "supplyChain"], "sector");
      const weighting = enumArg(input, "weighting", ["company", "value"], "value");
      if (groupBy === null) {
        return { ok: false, error: "groupBy must be sector or supplyChain." };
      }
      if (weighting === null) {
        return { ok: false, error: "weighting must be company or value." };
      }
      const allocation = await store.getAllocation(
        groupBy as "sector" | "supplyChain",
        weighting as "company" | "value",
      );
      return { ok: true, result: allocation };
    }
    default:
      return { ok: false, error: `Unknown tool: ${name}.` };
  }
}
