// src/lib/api.ts
const API_BASE =
  process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/+$/, '') ||
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, '');

export function getApiBase() {
  if (!API_BASE) {
    throw new Error('BACKEND URL is not set. Define NEXT_PUBLIC_BACKEND_URL.');
  }
  return API_BASE;
}

// Treat 404 as "not registered" by returning null; throw for other failures.
export async function fetchProductByCode(code: string) {
  const res = await fetch(`${getApiBase()}/api/products/${encodeURIComponent(code)}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`fetchProductByCode failed: ${res.status}`);
  return res.json() as Promise<{ code: string; name: string; unit_price: number }>;
}

export type PurchaseLineRequest = { code: string; qty: number };
export type PurchaseResponse = { total_amt: number };

export async function submitPurchase(lines: PurchaseLineRequest[]) {
  const res = await fetch(`${getApiBase()}/api/purchases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ lines }),
  });
  if (!res.ok) throw new Error(`submitPurchase failed: ${res.status}`);
  return res.json() as Promise<PurchaseResponse>;
}
