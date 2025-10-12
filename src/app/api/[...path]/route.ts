import type { NextRequest } from "next/server";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function backendBase() {
  return (
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_BASE ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    ""
  ).trim().replace(/\/+$/, "");
}

function fwdHeaders(req: NextRequest) {
  const allowed = ["accept", "content-type", "authorization", "cookie"];
  const h = new Headers();
  for (const k of allowed) {
    const v = req.headers.get(k);
    if (v) h.set(k, v);
  }
  return h;
}

async function forward(url: string, req: NextRequest) {
  const method = req.method.toUpperCase();
  let body: ArrayBuffer | undefined;
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    try { const blob = await req.blob(); body = await blob.arrayBuffer(); } catch {}
  }
  return fetch(url, { method, headers: fwdHeaders(req), body, redirect: "manual", cache: "no-store" });
}

function emsg(e: unknown) {
  if (e instanceof Error) return e.message;
  try { return JSON.stringify(e); } catch { return String(e); }
}

async function handle(req: NextRequest, segs: string[] = []) {
  const base = backendBase();
  if (!base) {
    return new Response(JSON.stringify({ error: "BACKEND_URL_NOT_SET" }), {
      status: 502, headers: { "content-type": "application/json" }
    });
  }
  const joined = segs.join("/");
  const qs = req.nextUrl.search || "";
  const candidates = [
    `${base}/api/${joined}${qs}`,
    `${base}/${joined}${qs}`,
  ];
  try {
    let res = await forward(candidates[0], req);
    if (res.status === 404) res = await forward(candidates[1], req);
    const buf = await res.arrayBuffer();
    const headers = new Headers(res.headers);
    headers.delete("content-encoding");
    headers.delete("transfer-encoding");
    return new Response(buf, { status: res.status, statusText: res.statusText, headers });
  } catch (e: unknown) {
    return new Response(JSON.stringify({ error: "PROXY_FETCH_FAILED", message: emsg(e), tried: candidates }), {
      status: 502, headers: { "content-type": "application/json" }
    });
  }
}

type Ctx = { params: { path?: string[] } };
export async function GET(req: NextRequest, ctx: Ctx) { return handle(req, ctx.params.path ?? []); }
export async function POST(req: NextRequest, ctx: Ctx) { return handle(req, ctx.params.path ?? []); }
export async function PUT(req: NextRequest, ctx: Ctx) { return handle(req, ctx.params.path ?? []); }
export async function PATCH(req: NextRequest, ctx: Ctx) { return handle(req, ctx.params.path ?? []); }
export async function DELETE(req: NextRequest, ctx: Ctx) { return handle(req, ctx.params.path ?? []); }
export async function HEAD(req: NextRequest, ctx: Ctx) { return handle(req, ctx.params.path ?? []); }
export async function OPTIONS(req: NextRequest, ctx: Ctx) { return handle(req, ctx.params.path ?? []); }
