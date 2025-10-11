const API_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? "").replace(/\/$/, "");

const GENERIC_ERROR =
  "サーバーへの通信でエラーが発生しました。しばらく待ってから再度お試しください。";

function buildUrl(path: string): string {
  if (!API_BASE) return path;
  return `${API_BASE}${path}`;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(buildUrl(path), {
    ...init,
    headers,
  });

  if (!response.ok) {
    throw new Error(GENERIC_ERROR);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export type Product = {
  code: string;
  name: string;
  unit_price: number;
};

export async function fetchProductByCode(code: string): Promise<Product | null> {
  if (!code) return null;
  try {
    const product = await request<Product | null>(`/api/products/${encodeURIComponent(code)}`);
    return product;
  } catch (error) {
    console.error("[API] fetchProductByCode failed", error);
    throw error;
  }
}

export type PurchaseLineRequest = {
  code: string;
  qty: number;
};

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
  if (!payload.length) {
    throw new Error("購入商品が1件以上必要です。");
  }

  return request<PurchaseResponse>("/api/purchase", {
    method: "POST",
    body: JSON.stringify({ lines: payload }),
  });
}
