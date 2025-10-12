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
    const res = await fetch(url, { method: "GET", cache: "no-store" });
    return { ok: true, status: res.status, url };
  } catch (e) {
    return { ok: false, status: 0, url, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function GET(_req: NextRequest) {
  const base = backendBase();
  // バックエンド未設定でも 200 を返し、アプリ自体は生かす
  if (!base) {
    return new Response(JSON.stringify({
      ok: true,
      frontend: "ok",
      backendConfigured: false
    }, null, 2), { status: 200, headers: { "content-type": "application/json" }});
  }

  const candidates = [`${base}/api/health`, `${base}/health`];
  const attempts = [];
  for (const u of candidates) {
    const r = await tryFetch(u);
    attempts.push(r);
    if (r.ok) break;
  }

  // 成功なら 200、すべて失敗でも「フロントは生きてる」ので 200 返す（詳細は payload で可視化）
  const backendReachable = attempts.some(a => a.ok);
  const payload = {
    ok: true,
    frontend: "ok",
    backendBase: base,
    backendReachable,
    attempts,
  };

  return new Response(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}
