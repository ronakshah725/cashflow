/* Cash Flow Calculator worker: Google login + KV-persisted assumptions.
 *
 * Routes:
 *   GET /                  login-gated SPA (served from Workers Static Assets)
 *   GET /auth/login        start Google OAuth
 *   GET /auth/callback     finish Google OAuth, set session cookie
 *   GET /auth/logout       clear session
 *   GET /api/defaults      seeded lever defaults (KV key defaults:v1), authed
 *   GET+PUT /api/assumptions  per-user lever overrides, authed
 *
 * Secrets (set in the Cloudflare dashboard, never in this repo):
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SESSION_SECRET, ALLOWED_EMAIL
 */

import { Hono } from "hono";
import type { Context } from "hono";

type Bindings = {
  ASSUMPTIONS: KVNamespace;
  ASSETS: Fetcher;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  SESSION_SECRET: string;
  ALLOWED_EMAIL: string;
};

type Session = { sub: string; email: string; exp: number };

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";
const SESSION_COOKIE = "cf_sess";
const SESSION_TTL = 60 * 60 * 24 * 30; // 30 days

const app = new Hono<{ Bindings: Bindings }>();

/* ---------- small helpers ---------- */

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randHex(n: number): string {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function hmacSign(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return b64url(new Uint8Array(sig));
}

function getCookie(req: Request, name: string): string | null {
  const h = req.headers.get("Cookie") || "";
  for (const part of h.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

function secretsReady(env: Bindings): boolean {
  return !!(
    env.GOOGLE_CLIENT_ID &&
    env.GOOGLE_CLIENT_SECRET &&
    env.SESSION_SECRET &&
    env.ALLOWED_EMAIL
  );
}

/* ---------- sessions ---------- */

async function readSession(req: Request, env: Bindings): Promise<Session | null> {
  const c = getCookie(req, SESSION_COOKIE);
  if (!c || !env.SESSION_SECRET) return null;
  const i = c.lastIndexOf(".");
  if (i < 0) return null;
  const sid = c.slice(0, i);
  const sig = c.slice(i + 1);
  const expect = await hmacSign(env.SESSION_SECRET, sid);
  if (sig !== expect) return null;
  const raw = await env.ASSUMPTIONS.get("sess:" + sid);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Session;
    if (!s.sub || !s.email || (s.exp && s.exp < Date.now())) return null;
    return s;
  } catch {
    return null;
  }
}

async function makeSession(env: Bindings, sub: string, email: string): Promise<string> {
  const sid = randHex(32);
  const sig = await hmacSign(env.SESSION_SECRET, sid);
  const sess: Session = { sub, email, exp: Date.now() + SESSION_TTL * 1000 };
  await env.ASSUMPTIONS.put("sess:" + sid, JSON.stringify(sess), {
    expirationTtl: SESSION_TTL,
  });
  return `${sid}.${sig}`;
}

function sessionCookieHeader(value: string, maxAge: number): string {
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function workerOrigin(req: Request): string {
  const u = new URL(req.url);
  return `${u.protocol}//${u.host}`;
}

const SETUP_HTML = `<!doctype html><html><head><meta charset=utf-8>
<meta name=viewport content="width=device-width,initial-scale=1"><title>Setup incomplete</title>
<style>body{font-family:system-ui,sans-serif;max-width:640px;margin:4rem auto;padding:0 1rem;color:#222}
h1{font-size:1.4rem}</style></head><body>
<h1>Setup incomplete</h1>
<p>The Google sign-in credentials for this app are not configured yet. The owner needs to add them before login will work.</p>
</body></html>`;

/* ---------- OAuth ---------- */

app.get("/auth/login", async (c) => {
  const env = c.env;
  if (!secretsReady(env)) return c.html(SETUP_HTML, 503);
  const state = randHex(16);
  await env.ASSUMPTIONS.put("oauth:" + state, "1", { expirationTtl: 600 });
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: workerOrigin(c.req.raw) + "/auth/callback",
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });
  return c.redirect(GOOGLE_AUTH_URL + "?" + params.toString(), 302);
});

app.get("/auth/callback", async (c) => {
  const env = c.env;
  if (!secretsReady(env)) return c.html(SETUP_HTML, 503);
  const url = new URL(c.req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return c.html("<h1>Sign-in failed</h1><p>Missing code or state.</p>", 400);
  }
  const seen = await env.ASSUMPTIONS.get("oauth:" + state);
  if (!seen) {
    return c.html(
      "<h1>Sign-in failed</h1><p>State mismatch or expired. Please try again.</p>",
      400,
    );
  }
  await env.ASSUMPTIONS.delete("oauth:" + state);

  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: workerOrigin(c.req.raw) + "/auth/callback",
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) {
    return c.html(
      "<h1>Sign-in failed</h1><p>Could not exchange the authorization code.</p>",
      502,
    );
  }
  const tokens = (await tokenRes.json()) as { access_token: string };

  const uiRes = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: "Bearer " + tokens.access_token },
  });
  if (!uiRes.ok) {
    return c.html(
      "<h1>Sign-in failed</h1><p>Could not read your Google profile.</p>",
      502,
    );
  }
  const profile = (await uiRes.json()) as {
    email?: string;
    email_verified?: boolean;
    sub?: string;
  };
  const email = (profile.email || "").toLowerCase();
  const allowed = (env.ALLOWED_EMAIL || "").toLowerCase();
  if (!profile.email_verified || !profile.sub || email !== allowed) {
    return c.html("<h1>Not authorized</h1><p>This app is private.</p>", 403);
  }

  const cookieVal = await makeSession(env, profile.sub, email);
  c.header("Cache-Control", "no-store");
  c.header("Set-Cookie", sessionCookieHeader(cookieVal, SESSION_TTL));
  return c.redirect("/", 302);
});

app.get("/auth/logout", async (c) => {
  const cookie = getCookie(c.req.raw, SESSION_COOKIE);
  if (cookie) {
    await c.env.ASSUMPTIONS.delete("sess:" + cookie.split(".")[0]);
  }
  c.header("Cache-Control", "no-store");
  c.header("Set-Cookie", sessionCookieHeader("deleted", 0));
  return c.redirect("/", 302);
});

/* ---------- authed JSON API ---------- */

// Per-user lever overrides. Only known keys with sane types are stored,
// so a bad client cannot corrupt the store.
const SANITIZERS: Record<string, (v: unknown) => unknown> = {
  hisPay: Number,
  herPay: Number,
  bonusNet: Number,
  includeBonus: (v) => !!v,
  grossBase: Number,
  rent: Number,
  housing: Number,
  dining: Number,
  groceries: Number,
  coffee: Number,
  other: Number,
  travel: Number,
  diningBaby: Number,
  travelBaby: Number,
  childcare: (v) =>
    ["daycare", "nanny", "aunty", "none", "custom"].includes(String(v))
      ? String(v)
      : "daycare",
  childcareCustom: Number,
  consumables: Number,
  formula: Number,
  gear: Number,
  medical: Number,
  startMonth: (v) => (/^\d{4}-\d{2}$/.test(String(v)) ? String(v) : "2027-07"),
};

function sanitize(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if (!(k in SANITIZERS)) continue;
    clean[k] = SANITIZERS[k](v);
  }
  return clean;
}

type AppContext = Context<{ Bindings: Bindings }>;

async function requireSession(c: AppContext): Promise<Session | null> {
  return readSession(c.req.raw, c.env);
}

app.get("/api/assumptions", async (c) => {
  const sess = await requireSession(c);
  if (!sess) return c.json({ error: "unauthorized" }, 401);
  const raw = await c.env.ASSUMPTIONS.get("asm:" + sess.sub);
  c.header("Cache-Control", "no-store");
  return c.json(raw ? JSON.parse(raw) : {});
});

app.put("/api/assumptions", async (c) => {
  const sess = await requireSession(c);
  if (!sess) return c.json({ error: "unauthorized" }, 401);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid JSON" }, 400);
  }
  const clean = sanitize(body);
  if (!clean) return c.json({ error: "expected a JSON object" }, 400);
  await c.env.ASSUMPTIONS.put("asm:" + sess.sub, JSON.stringify(clean));
  c.header("Cache-Control", "no-store");
  return c.json({ ok: true });
});

// Seeded lever defaults (KV key defaults:v1). The SPA loads these on first
// run; per-user overrides from /api/assumptions win. Returns {} when never seeded.
app.get("/api/defaults", async (c) => {
  const sess = await requireSession(c);
  if (!sess) return c.json({ error: "unauthorized" }, 401);
  const raw = await c.env.ASSUMPTIONS.get("defaults:v1");
  c.header("Cache-Control", "no-store");
  return c.json(raw ? JSON.parse(raw) : {});
});

/* ---------- SPA (login-gated) ---------- */

app.get("/", async (c) => {
  if (!secretsReady(c.env)) return c.html(SETUP_HTML, 503);
  const sess = await readSession(c.req.raw, c.env);
  if (!sess) return c.redirect("/auth/login", 302);
  // NOTE: do NOT rewrite to /index.html here. Workers Static Assets resolves
  // "/" to index.html itself, and it 307-redirects a literal /index.html
  // request back to "/", which caused an infinite redirect loop for
  // authenticated users (the login itself was fine).
  return c.env.ASSETS.fetch(c.req.raw);
});

// Static assets (JS/CSS) carry no personal data; serve them directly.
app.get("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
