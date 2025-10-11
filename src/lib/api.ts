// src/lib/api.ts
// 1) どのキーでも拾えるようにし、末尾/を除去
const API_BASE = (
  process.env.NEXT_PUBLIC_API_BASE ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  ""
).replace(/\/$/, "");

const GENERIC_ERROR =
  "サーバーへの通信でエラーが発生しました。しばらく待ってから再度お試しください。";

function buildUrl(path: string): string {
  return API_BASE ? `${API_BASE}${path}` : path;
}

type RequestOptions = RequestInit & { timeoutMs?: number; okStatuses?: number[] };

async function request<T>(path: string, init: RequestOptions = {}): Promise<T> {
  const { timeoutMs = 10000, okStatuses } = init;

  // 2) タイムアウト制御
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // 3) GETには Content-Type をつけない（CORS回避）
  const headers = new Headers(init.headers);
  const method = (init.method || "GET").toUpperCase();
  if (method !== "GET" && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  try {
    const res = await fetch(buildUrl(path), {
      ...init,
      headers,
      signal: controller.signal,
      cache: "no-store",
    });

    // 4) 呼び出し側が許容する Status（例：404）を素通し
    if (okStatuses?.includes(res.status)) {
      const ct = res.headers.get("content-type") || "";
      return (ct.includes("application/json") ? await res.json() : await res.text()) as T;
    }

    if (!res.ok) {
      throw new Error(GENERIC_ERROR);
    }

    if (res.status === 204) return undefined as T;

    const ct = res.headers.get("content-type") || "";
    return (ct.includes("application/json") ? await res.json() : await res.text()) as T;
  } catch (e: any) {
    if (e?.name === "AbortError") {
      throw new Error("タイムアウトしました。通信環境をご確認ください。");
    }
    if (e instanceof TypeError) {
      // ネット断 or CORS で fetch は TypeError を投げる
      throw new Error("ネットワークまたはCORSの問題が発生しました。");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export type Product = {
  code: string;
  name: string;
  unit_price: number;
};

export async function fetchProductByCode(code: string): Promise<Product | null> {
  if (!code) return null;

  try {
    // 5) 404 を許容して UI 側で“未登録”扱いできるようにする
    const res = await request<Product | null>(`/api/products/${encodeURIComponent(code)}`, {
      method: "GET",
      okStatuses: [200, 404],
      timeoutMs: 8000,
    });

    // 旧バックやプロキシ経由で text が返ることもあるため念のため正規化
    return res && typeof res === "object" ? (res as Product) : null;
  } catch (error) {
    console.error("[API] fetchProductByCode failed", error);
    throw error; // ここは通信/サーバ障害
  }
}

export type PurchaseLineRequest = { code: string; qty: number };

export type PurchaseLineResponse = {
  code: string;
  name: string;
  unit_price: number;
  qty: number;
  line_total: number;
  tax_cd: string;
};

export type PurchaseResponse = {
  transaction_id: string;
  created_at: string;
  ttl_amt_ex_tax: number;
  tax_amt: number;
  total_amt: number;
  clerk_cd: string;
  store_cd: string;
  pos_id: string;
  lines: PurchaseLineResponse[];
};

export async function submitPurchase(payload: PurchaseLineRequest[]): Promise<PurchaseResponse> {
  if (!payload.length) throw new Error("購入商品が1件以上必要です。");

  return request<PurchaseResponse>("/api/purchase", {
    method: "POST",
    body: JSON.stringify({ lines: payload }),
    timeoutMs: 15000,
  });
}
