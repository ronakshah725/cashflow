// Thin fetch wrappers for the worker's JSON API.

import type { Assumptions, SeededDefaults } from "./types";

async function get<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(path, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Seeded lever defaults (KV key defaults:v1). Null when never seeded. */
export function fetchDefaults(): Promise<SeededDefaults | null> {
  return get<SeededDefaults>("/api/defaults");
}

/** The signed-in user's saved lever overrides. Empty object on first run. */
export async function fetchAssumptions(): Promise<Partial<Assumptions>> {
  const data = await get<Partial<Assumptions>>("/api/assumptions");
  return data && typeof data === "object" ? data : {};
}

/** Persist the current levers. Returns true on success. */
export async function saveAssumptions(a: Assumptions): Promise<boolean> {
  try {
    const res = await fetch("/api/assumptions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(a),
    });
    return res.ok;
  } catch {
    return false;
  }
}
