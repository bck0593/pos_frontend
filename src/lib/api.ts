// src/lib/api.ts
const API_BASE =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://127.0.0.1:8000";

export type Product = { code: string; name: string; unit_price: number };
export type PurchaseItem = { product_code: string; quantity: number };
export type PurchaseResponse = { success: boolean; transaction_id: number; total_amount: number };

export async function getProduct(code: string): Promise<Product | null> {
  const res = await fetch(`${API_BASE}/products?code=${encodeURIComponent(code)}`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`GET /products failed: ${res.status}`);
  return res.json(); // 見つからなければ null
}

export async function purchase(items: PurchaseItem[], extra?: {
  emp_cd?: string; store_cd?: string; pos_no?: string;
}): Promise<PurchaseResponse> {
  const body = {
    emp_cd: extra?.emp_cd ?? "1234567890",
    store_cd: extra?.store_cd ?? "30",
    pos_no: extra?.pos_no ?? "90",
    items,
  };

  const res = await fetch(`${API_BASE}/purchase`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let detail = res.statusText;
    try { const j = await res.json(); detail = j.detail ?? detail; } catch {}
    throw new Error(`POST /purchase failed: ${detail}`);
  }
  return res.json();
}

export async function health(): Promise<{status: string}> {
  const res = await fetch(`${API_BASE}/health`, { credentials: "include", cache: "no-store" });
  if (!res.ok) throw new Error(`GET /health failed: ${res.status}`);
  return res.json();
}
