// src/lib/api.ts

// ====== 設定 ======
/**
 * .env 例:
 * NEXT_PUBLIC_BACKEND_URL="https://app-002-gen10-step3-1-py-oshima29.azurewebsites.net"
 */
const RAW_API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "";

// 末尾の / を除去し、先頭の余計なスペース等も除去
const API_BASE = RAW_API_BASE.trim().replace(/\/+$/, "");

export function getApiBase() {
  return API_BASE;
}

const GENERIC_ERROR =
  "サーバーへの通信でエラーが発生しました。しばらく待ってから再度お試しください。";

// ====== ユーティリティ ======
function joinUrl(base: string, path: string) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base}${p}` : p; // base 未設定なら相対パスのまま（同一オリジン想定）
}

async function readBody<T>(res: Response): Promise<T> {
  const ct = res.headers.get("content-type")?.toLowerCase() ?? "";
  if (ct.includes("application/json")) {
    return (await res.json()) as T;
  }
  // JSONじゃなく text のこともある（古い実装・404 など）
  return (await res.text()) as unknown as T;
}

type RequestOptions = RequestInit & {
  timeoutMs?: number;
  okStatuses?: number[]; // 呼び出し側が許容するHTTPステータス（例: [200, 404]）
};

async function request<T>(path: string, init: RequestOptions = {}): Promise<T> {
  const { timeoutMs = 10_000, okStatuses } = init;

  // AbortController でタイムアウト
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // GET時の CORS 回避: Content-Type は付けない
  const headers = new Headers(init.headers);
  const method = (init.method || "GET").toUpperCase();

  // 受け入れはJSONを優先
  if (!headers.has("Accept")) headers.set("Accept", "application/json, text/plain;q=0.8,*/*;q=0.5");

  if (method === "GET") {
    if (headers.has("Content-Type")) headers.delete("Content-Type");
  } else {
    if (!(init.body instanceof FormData) && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
  }

  const url = joinUrl(API_BASE, path);

  try {
    const res = await fetch(url, {
      ...init,
      headers,
      signal: controller.signal,
      // キャッシュは毎回無効化（在庫や価格などの最新性重視）
      cache: "no-store",
      // CORS 環境を想定。「クッキー不要」なら omit のままでOK
      credentials: init.credentials ?? "omit",
      mode: init.mode ?? "cors",
    });

    // 許容ステータスを素通し
    if (okStatuses?.includes(res.status)) {
      return await readBody<T>(res);
    }

    if (!res.ok) {
      // 具体的なメッセージを返さない（UI/UX上は汎用文言が安全）
      throw new Error(GENERIC_ERROR);
    }

    // 204 No Content
    if (res.status === 204) {
      return undefined as T;
    }

    return await readBody<T>(res);
  } catch (e: any) {
    if (e?.name === "AbortError") {
      throw new Error("タイムアウトしました。通信環境をご確認ください。");
    }
    // fetch はネットワーク断やCORSエラーで TypeError を投げる
    if (e instanceof TypeError) {
      throw new Error("ネットワークまたはCORSの問題が発生しました。");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// ====== 型 ======
export type Product = {
  code: string;
  name: string;
  unit_price: number;
};

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

// ====== API ======
export async function fetchProductByCode(code: string): Promise<Product | null> {
  if (!code) return null;

  try {
    // 404 は “未登録”として null を返したいので許容
    const res = await request<Product | string | null>(`/api/products/${encodeURIComponent(code)}`, {
      method: "GET",
      okStatuses: [200, 404],
      timeoutMs: 8_000,
    });

    // 古い実装で text が返ることもあるので正規化
    if (res && typeof res === "object") return res as Product;
    return null;
  } catch (error) {
    console.error("[API] fetchProductByCode failed:", error);
    throw error; // 通信/サーバ障害は上位(UI)で通知
  }
}

export async function submitPurchase(payload: PurchaseLineRequest[]): Promise<PurchaseResponse> {
  if (!payload.length) throw new Error("購入商品が1件以上必要です。");

  return request<PurchaseResponse>("/api/purchase", {
    method: "POST",
    body: JSON.stringify({ lines: payload }),
    timeoutMs: 15_000,
  });
}

// （任意）疎通確認ヘルスチェック
export async function ping(): Promise<boolean> {
  try {
    await request<string>("/api/health", { method: "GET", okStatuses: [200, 404], timeoutMs: 5_000 });
    return true;
  } catch {
    return false;
  }
}
