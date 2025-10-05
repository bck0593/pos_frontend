const BASE = process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, '') ?? '';

export type ProductOut = {
  code: string;
  name: string;
  price: number;
};

export type PurchaseItem = {
  product_code: string;
  quantity: number;
};

export type PurchaseRequest = {
  emp_cd?: string;     // PDF準拠: 10桁まで
  store_cd?: string;   // PDF準拠: 5桁
  pos_no?: string;     // PDF準拠: 3桁
  items: PurchaseItem[];
};

export type PurchaseResponse = {
  success: boolean;
  transaction_id: number;
  total_amount: number;        // 税込
  total_amount_ex_tax?: number;// 税抜（バックエンド対応済みなら）
  tax_cd?: string;             // 税区分（例 '10'）
};

export async function health(): Promise<'ok'|'ng'> {
  try {
    const r = await fetch(`${BASE}/health`, { cache: 'no-store' });
    if (!r.ok) return 'ng';
    const j = await r.json();
    return j?.status === 'ok' ? 'ok' : 'ng';
  } catch {
    return 'ng';
  }
}

export async function fetchProductByCode(code: string): Promise<ProductOut | null> {
  const params = new URLSearchParams({ code });
  const url = `${BASE}/products?${params.toString()}`;
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) return null;
  const json = await response.json();
  if (json && typeof json === 'object' && 'product' in json) {
    const envelope = json as { product: ProductOut | null };
    return envelope.product ?? null;
  }
  return (json as ProductOut | null) ?? null;
}

export async function postPurchase(req: PurchaseRequest): Promise<PurchaseResponse> {
  const r = await fetch(`${BASE}/purchase`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}