// frontend/src/lib/pay.ts
export type CartLine = {
  code: string;
  name: string;
  unitPrice: number; // 税抜
  quantity: number;
};

function getApiBase() {
  // 既存の NEXT_PUBLIC_API_BASE_URL / NEXT_PUBLIC_BACKEND_URL を優先
  return (
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    ""
  ).trim().replace(/\/+$/, "");
}

export async function startStripeCheckout(lines: CartLine[]) {
  if (!lines || lines.length === 0) {
    throw new Error("カートが空です");
  }
  const apiBase = getApiBase();
  if (!apiBase) {
    throw new Error("APIベースURLが未設定です（NEXT_PUBLIC_API_BASE_URL か NEXT_PUBLIC_BACKEND_URL）");
  }

  const res = await fetch(`${apiBase}/api/checkout/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      origin: window.location.origin,
      items: lines.map((l) => ({ code: l.code, qty: l.quantity })),
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Stripeセッション作成に失敗: ${res.status} ${text}`);
  }

  const { url } = await res.json();
  if (!url) throw new Error("Checkout URLが取得できませんでした");
  window.location.href = url;
}
