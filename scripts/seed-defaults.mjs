// Seeds the gitignored config/assumptions.defaults.json into the `cashflow-kv`
// KV namespace under the key `defaults:v1`. The worker serves it at the
// authenticated GET /api/defaults endpoint; the SPA uses it as the lever
// defaults on first run.
//
// Usage:  CLOUDFLARE_API_TOKEN=... node scripts/seed-defaults.mjs
// (the token is never committed; see README for how CI and local runs get it)

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ACCOUNT_ID = "8bf8cb47c4e0d03ed3c1ab78485871a4";
const NAMESPACE_ID = "ffd9a603c25945179d5824dc1a322439";
const KV_KEY = "defaults:v1";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const body = readFileSync(join(root, "config", "assumptions.defaults.json"), "utf8");

// Fail fast if the defaults file is missing or not valid JSON.
const parsed = JSON.parse(body);
if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
  throw new Error("config/assumptions.defaults.json must be a JSON object");
}

const token = process.env.CLOUDFLARE_API_TOKEN;
if (!token) {
  throw new Error("CLOUDFLARE_API_TOKEN is not set");
}

const url =
  `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}` +
  `/storage/kv/namespaces/${NAMESPACE_ID}/values/${KV_KEY}`;

const res = await fetch(url, {
  method: "PUT",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body,
});

const result = await res.json();
if (!res.ok || result.success !== true) {
  console.error(JSON.stringify(result, null, 2));
  throw new Error(`KV write failed (HTTP ${res.status})`);
}
console.log(`Seeded ${KV_KEY} (${body.length} bytes) into cashflow-kv`);
