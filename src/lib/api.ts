// lib/api.ts
const BASE =
  process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, '') ??
  process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, '') ??
  '';

if (!BASE) {
  console.warn('⚠️ NEXT_PUBLIC_API_BASE または NEXT_PUBLIC_BACKEND_URL が設定されていません');
}

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
  emp_cd?: string; // 従業員コード（最大10桁）
  store_cd?: string; // 店舗コード（最大5桁）
  pos_no?: string; // POS番号（最大3桁）
  items: PurchaseItem[];
};

export type PurchaseResponse = {
  success: boolean;
  transaction_id: number;
  total_amount: number; // 税込
  total_amount_ex_tax?: number; // 税抜
  tax_cd?: string; // 税区分（例: '10'）
};

/**
 * バックエンド疎通確認
 */
export async function health(): Promise<'ok' | 'ng'> {
  const url = `${BASE}/health`;
  try {
    console.log('🩺 Checking backend health:', url);
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      console.error('❌ Health check failed:', res.status, res.statusText);
      return 'ng';
    }
    const json = await res.json();
    return json?.status === 'ok' ? 'ok' : 'ng';
  } catch (err) {
    console.error('⚠️ Health check error:', err);
    return 'ng';
  }
}

/**
 * 商品コードで検索
 */
export async function fetchProductByCode(code: string): Promise<ProductOut | null> {
  const url = `${BASE}/products?code=${encodeURIComponent(code)}`;
  try {
    console.log('🔎 Fetching product:', url);
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      console.error('❌ fetchProductByCode failed:', res.status, res.statusText);
      return null;
    }
    const data = await res.json();
    return data?.product ?? null;
  } catch (err) {
    console.error('⚠️ fetchProductByCode error:', err);
    return null;
  }
}

/**
 * 購入リクエストを送信
 */
export async function postPurchase(req: PurchaseRequest): Promise<PurchaseResponse> {
  const url = `${BASE}/purchase`;
  try {
    console.log('🧾 Posting purchase:', url, req);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });

    if (!res.ok) {
      console.error('❌ postPurchase failed:', res.status, res.statusText);
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as PurchaseResponse;
    return data;
  } catch (err) {
    console.error('⚠️ postPurchase error:', err);
    throw err instanceof Error ? err : new Error(String(err));
  }
}
