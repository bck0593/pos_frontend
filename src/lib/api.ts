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

// 本番で空は即エラーにする（相対パス誤送信を未然にブロック）
export function getApiBase() {
  if (!API_BASE) {
    // ここで throw しておけば、「通信エラー地獄」ではなく原因特定が即できる
    throw new Error(
      "[CONFIG] API_BASE is empty at build time. Check NEXT_PUBLIC_* in CI build env."
    );
  }
  return API_BASE;
}

const GENERIC_ERROR =
  "サーバーへの通信でエラーが発生しました。しばらく待ってから再度お試しください。";

// ====== ユーティリティ ======
function joinUrl(base: string, path: string) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

// ====== API呼び出し ======
export async function fetchProductByCode(code: string) {
  const url = joinUrl(getApiBase(), `/api/products/${code}`);
  try {
    const res = await fetch(url, { cache: "no-store" });

    // 404 は「未登録」を正常系として扱う（通信エラーにしない）
    if (res.status === 404) return null;

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return await res.json();
  } catch (e) {
    console.error("[API] fetchProductByCode failed", e);
    throw new Error(GENERIC_ERROR);
  }
}
