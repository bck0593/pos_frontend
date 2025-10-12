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

// フロント→バックエンドへ渡すヘッダ（最小限）
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

  let body: ArrayBuffer | undefined;
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    try {
      const blob = await req.blob();
      body = await blob.arrayBuffer();
    } catch {
      body = undefined;
    }
  }

  return fetch(url, {
    method,
    headers,
    body,
    redirect: "manual",
    cache: "no-store",
  });
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

async function proxy(req: NextRequest, pathParts: string[]) {
  const backend = getBackendBase();
  if (!backend) {
    return NextResponse.json(
      {
        error: "BACKEND_URL_NOT_SET",
        hint:
          "Set NEXT_PUBLIC_BACKEND_URL (or NEXT_PUBLIC_API_BASE[_URL]) in App Service Configuration",
      },
      { status: 502 }
    );
  }

  const joined = (pathParts ?? []).join("/");
  const search = req.nextUrl.search || "";

  const tryUrls = [
    `${backend}/api/${joined}${search}`,
    `${backend}/${joined}${search}`,
  ];

  try {
    let res = await forwardOnce(tryUrls[0], req);
    if (res.status === 404) {
      res = await forwardOnce(tryUrls[1], req);
    }

    const buf = await res.arrayBuffer();
    const headers = new Headers(res.headers);
    headers.delete("content-encoding");
    headers.delete("transfer-encoding");

    return new NextResponse(buf, {
      status: res.status,
      statusText: res.statusText,
      headers,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: "PROXY_FETCH_FAILED", message: errMsg(e), tried: tryUrls },
      { status: 502 }
    );
  }
}

// 全HTTPメソッド対応（params が undefined のケースもケア）
type Ctx = { params: { path?: string[] } };

export async function GET(req: NextRequest, ctx: Ctx) {
  return proxy(req, ctx.params.path ?? []);
}
export async function POST(req: NextRequest, ctx: Ctx) {
  return proxy(req, ctx.params.path ?? []);
}
export async function PUT(req: NextRequest, ctx: Ctx) {
  return proxy(req, ctx.params.path ?? []);
}
export async function PATCH(req: NextRequest, ctx: Ctx) {
  return proxy(req, ctx.params.path ?? []);
}
export async function DELETE(req: NextRequest, ctx: Ctx) {
  return proxy(req, ctx.params.path ?? []);
}
export async function HEAD(req: NextRequest, ctx: Ctx) {
  return proxy(req, ctx.params.path ?? []);
}
export async function OPTIONS(req: NextRequest, ctx: Ctx) {
  return proxy(req, ctx.params.path ?? []);
}
