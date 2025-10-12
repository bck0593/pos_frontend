import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getBackendBase() {
  const raw =
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_BASE ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    "";
  return raw.trim().replace(/\/+$/, "");
}

function buildForwardHeaders(req: NextRequest) {
  const allowed = ["accept", "content-type", "authorization", "cookie"];
  const h = new Headers();
  for (const k of allowed) {
    const v = req.headers.get(k);
    if (v) h.set(k, v);
  }
  return h;
}

async function forwardOnce(url: string, req: NextRequest) {
  const headers = buildForwardHeaders(req);
  const method = req.method.toUpperCase();
  let body: BodyInit | undefined = undefined;
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const blob = await req.blob().catch(() => undefined);
    body = blob ? await blob.arrayBuffer() : undefined;
  }
  return fetch(url, { method, headers, body, redirect: "manual", cache: "no-store" });
}

async function proxy(req: NextRequest, pathParts: string[]) {
  const backend = getBackendBase();
  if (!backend) {
    return NextResponse.json(
      { error: "BACKEND_URL_NOT_SET", hint: "Set NEXT_PUBLIC_BACKEND_URL in App Service Configuration" },
      { status: 502 }
    );
  }

  const joined = (pathParts ?? []).join("/");
  const tryUrls = [`${backend}/api/${joined}`, `${backend}/${joined}`];

  try {
    let res = await forwardOnce(tryUrls[0], req);
    if (res.status === 404) res = await forwardOnce(tryUrls[1], req);

    const buf = await res.arrayBuffer();
    const headers = new Headers(res.headers);
    headers.delete("content-encoding");
    headers.delete("transfer-encoding");
    return new NextResponse(buf, { status: res.status, statusText: res.statusText, headers });
  } catch (e: any) {
    return NextResponse.json(
      { error: "PROXY_FETCH_FAILED", message: String(e?.message || e), tried: tryUrls },
      { status: 502 }
    );
  }
}

export async function GET(req: NextRequest, ctx: { params: { path: string[] } }) { return proxy(req, ctx.params.path || []); }
export async function POST(req: NextRequest, ctx: { params: { path: string[] } }) { return proxy(req, ctx.params.path || []); }
export async function PUT(req: NextRequest, ctx: { params: { path: string[] } }) { return proxy(req, ctx.params.path || []); }
export async function PATCH(req: NextRequest, ctx: { params: { path: string[] } }) { return proxy(req, ctx.params.path || []); }
export async function DELETE(req: NextRequest, ctx: { params: { path: string[] } }) { return proxy(req, ctx.params.path || []); }
export async function HEAD(req: NextRequest, ctx: { params: { path: string[] } }) { return proxy(req, ctx.params.path || []); }
export async function OPTIONS(req: NextRequest, ctx: { params: { path: string[] } }) { return proxy(req, ctx.params.path || []); }