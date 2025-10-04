"use client";

import { useEffect, useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
import type { Product } from "@/lib/api";
import { getProduct, purchase, health } from "@/lib/api";

type CartLine = {
  code: string;
  name: string;
  unit_price: number;
  quantity: number;
};

const formatCurrency = (value: number) => `${value.toLocaleString("ja-JP")} 円`;

export default function Page() {
  const [code, setCode] = useState("");
  const [found, setFound] = useState<Product | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("unknown");

  useEffect(() => {
    health()
      .then((response) => setStatus(response.status))
      .catch(() => setStatus("ng"));
  }, []);

  const total = useMemo(
    () => cart.reduce((sum, line) => sum + line.unit_price * line.quantity, 0),
    [cart],
  );

  const readCode = async () => {
    setMessage("");
    setFound(null);

    const trimmed = code.trim();
    if (!trimmed) {
      setMessage("商品コードを入力してください");
      return;
    }

    try {
      setLoading(true);
      const product = await getProduct(trimmed);

      if (!product) {
        setMessage("商品が見つかりません（マスタ未登録）");
      }

      setFound(product);
    } catch (error: unknown) {
      const messageText =
        error instanceof Error && error.message
          ? error.message
          : "読み込みに失敗しました";
      setMessage(messageText);
    } finally {
      setLoading(false);
    }
  };

  const handleCodeKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      void readCode();
    }
  };

  const addToCart = () => {
    if (!found) {
      return;
    }

    setCart((prev) => {
      const index = prev.findIndex((item) => item.code === found.code);
      if (index >= 0) {
        const next = [...prev];
        next[index] = { ...next[index], quantity: next[index].quantity + 1 };
        return next;
      }

      return [
        ...prev,
        {
          code: found.code,
          name: found.name,
          unit_price: found.unit_price,
          quantity: 1,
        },
      ];
    });

    setCode("");
    setFound(null);
  };

  const updateQuantity = (productCode: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((line) =>
          line.code === productCode
            ? { ...line, quantity: line.quantity + delta }
            : line,
        )
        .filter((line) => line.quantity > 0),
    );
  };

  const removeFromCart = (productCode: string) => {
    setCart((prev) => prev.filter((line) => line.code !== productCode));
  };

  const submitPurchase = async () => {
    if (cart.length === 0) {
      setMessage("購入品目が空です");
      return;
    }

    try {
      setLoading(true);
      const response = await purchase(
        cart.map((line) => ({
          product_code: line.code,
          quantity: line.quantity,
        })),
      );

      alert(
        `購入が完了しました。\n取引ID: ${response.transaction_id}\n合計金額（税込想定）: ${response.total_amount} 円`,
      );

      setCart([]);
      setCode("");
      setFound(null);
      setMessage("");
    } catch (error: unknown) {
      const messageText =
        error instanceof Error && error.message
          ? error.message
          : "購入に失敗しました";
      setMessage(messageText);
    } finally {
      setLoading(false);
    }
  };

  const totalDisplay = formatCurrency(total);
  const productNameField = found
    ? found.name
    : message
    ? "商品が見つかりません"
    : "";
  const productPriceField = found ? formatCurrency(found.unit_price) : "";

  return (
    <main className="mx-auto max-w-5xl p-6 font-sans">
      <div className="mb-3 text-sm text-gray-500">
        Backend health: <b>{status}</b>
      </div>

      <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
        <section className="rounded-xl border bg-gray-50 p-4">
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="商品コード（例: 4900002）"
            className="mb-3 w-full rounded-lg border px-3 py-2"
            onKeyDown={handleCodeKeyDown}
          />

          <button
            onClick={() => void readCode()}
            disabled={loading}
            className="mb-4 w-full rounded-lg bg-sky-600 py-2 text-white disabled:opacity-50"
          >
            商品コードを読み込み
          </button>

          <input
            value={productNameField}
            readOnly
            placeholder="商品名"
            className="mb-3 w-full rounded-lg border px-3 py-2 bg-white"
          />

          <input
            value={productPriceField}
            readOnly
            placeholder="単価"
            className="mb-4 w-full rounded-lg border px-3 py-2 bg-white"
          />

          <button
            onClick={addToCart}
            disabled={!found}
            className="w-full rounded-lg bg-emerald-600 py-2 text-white disabled:opacity-50"
          >
            追加
          </button>

          {message && <p className="mt-3 text-sm text-red-600">{message}</p>}
        </section>

        <section className="rounded-xl border bg-gray-50 p-4">
          <h2 className="mb-3 font-semibold">購入リスト</h2>

          {cart.length === 0 ? (
            <p className="text-gray-500">追加された商品はありません。</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-1 text-left">名称</th>
                  <th className="py-1 text-center">数量</th>
                  <th className="py-1 text-right">単価</th>
                  <th className="py-1 text-right">小計</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {cart.map((line) => (
                  <tr key={line.code} className="border-b">
                    <td className="py-1">{line.name}</td>
                    <td className="py-1 text-center">
                      <button
                        onClick={() => updateQuantity(line.code, -1)}
                        className="border px-2 rounded"
                      >
                        -
                      </button>
                      <span className="px-2">{line.quantity}</span>
                      <button
                        onClick={() => updateQuantity(line.code, 1)}
                        className="border px-2 rounded"
                      >
                        +
                      </button>
                    </td>
                    <td className="py-1 text-right">{formatCurrency(line.unit_price)}</td>
                    <td className="py-1 text-right">{formatCurrency(line.unit_price * line.quantity)}</td>
                    <td className="py-1 text-center">
                      <button
                        onClick={() => removeFromCart(line.code)}
                        className="text-red-600"
                      >
                        削除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="py-2 text-right font-semibold" colSpan={3}>
                    合計
                  </td>
                  <td className="py-2 text-right font-semibold">{totalDisplay}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          )}

          <button
            onClick={() => void submitPurchase()}
            disabled={cart.length === 0 || loading}
            className="mt-4 w-full rounded-lg bg-indigo-600 py-2 text-white disabled:opacity-50"
          >
            購入
          </button>
        </section>
      </div>
    </main>
  );
}
