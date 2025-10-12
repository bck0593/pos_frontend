import type { NextRequest } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function backendBase() {
  return (
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_BASE ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    ""
  ).trim().replace(/\/+$/, "");
}

async function tryFetch(url: string) {
  try {
    const r = await fetch(url, { method: "GET", cache: "no-store" });
    return { ok: true, status: r.status, url };
  } catch (e: any) {
    return { ok: false, status: 0, url, error: e?.message ?? String(e) };
  }
}

export async function GET(_req: NextRequest) {
  const base = backendBase();
  if (!base) {
    return new Response(JSON.stringify({ ok: true, frontend: "ok", backendConfigured: false }, null, 2), {
      status: 200, headers: { "content-type": "application/json" }
    });
  }
  const candidates = [`${base}/api/health`, `${base}/health`];
  const attempts = [];
  for (const u of candidates) {
    const res = await tryFetch(u);
    attempts.push(res);
    if (res.ok) break;
  }
  return new Response(JSON.stringify({
    ok: true, frontend: "ok",
    backendBase: base, backendReachable: attempts.some(a => a.ok),
    attempts
  }, null, 2), { status: 200, headers: { "content-type": "application/json" }});
}
