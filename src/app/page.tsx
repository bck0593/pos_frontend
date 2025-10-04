"use client";

import { useEffect, useMemo, useState } from "react";
import type { Product } from "@/lib/api";
import { getProduct, purchase, health } from "@/lib/api";

type CartLine = { code: string; name: string; unit_price: number; quantity: number };

export default function Page() {
  // ②コード入力エリア
  const [code, setCode] = useState("");
  // ③名称表示エリア・④単価表示エリア
  const [found, setFound] = useState<Product | null>(null);
  // ⑥購入品目リスト
  const [cart, setCart] = useState<CartLine[]>([]);
  const [msg, setMsg] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>("unknown");

  useEffect(() => { health().then(r => setStatus(r.status)).catch(() => setStatus("ng")); }, []);

  const total = useMemo(() => cart.reduce((s, l) => s + l.unit_price * l.quantity, 0), [cart]);

  // ①読込みボタン：商品コード照会
  const readCode = async () => {
    setMsg("");
    setFound(null);
    if (!code.trim()) { setMsg("商品コードを入力してください"); return; }
    try {
      setLoading(true);
      const p = await getProduct(code.trim());
      if (p === null) setMsg("商品が見つかりません（マスタ未登録）");
      setFound(p);
    } catch (e:any) {
      setMsg(e.message ?? "読み込みに失敗しました");
    } finally { setLoading(false); }
  };

  // ⑤購入リストへ追加ボタン
  const addToList = () => {
    if (!found) return;
    setCart(prev => {
      const i = prev.findIndex(x => x.code === found.code);
      if (i >= 0) {
        const c = [...prev]; c[i] = { ...c[i], quantity: c[i].quantity + 1 }; return c;
      }
      return [...prev, { code: found.code, name: found.name, unit_price: found.unit_price, quantity: 1 }];
    });
    setCode("");
    setFound(null);
  };

  // ⑦購入ボタン
  const doPurchase = async () => {
    if (cart.length === 0) { setMsg("購入品目が空です"); return; }
    try {
      setLoading(true);
      const res = await purchase(cart.map(l => ({ product_code: l.code, quantity: l.quantity })));
      alert(`購入が完了しました。\n取引ID: ${res.transaction_id}\n合計金額(税込想定): ${res.total_amount} 円`);
      // OKならクリア（②〜⑥の内容をクリア）
      setCart([]); setCode(""); setFound(null); setMsg("");
    } catch (e:any) {
      setMsg(e.message ?? "購入に失敗しました");
    } finally { setLoading(false); }
  };

  const inc = (c:string)=> setCart(p=>p.map(l=>l.code===c?{...l,quantity:l.quantity+1}:l));
  const dec = (c:string)=> setCart(p=>p.map(l=>l.code===c?{...l,quantity:Math.max(1,l.quantity-1)}:l).filter(l=>l.quantity>0));
  const del = (c:string)=> setCart(p=>p.filter(l=>l.code!==c));

  return (
    <main className="mx-auto max-w-5xl p-6 font-sans">
      <div className="mb-3 text-sm text-gray-500">Backend health: <b>{status}</b></div>

      {/* 左：入力〜追加 / 右：購入リスト */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 左パネル */}
        <section className="rounded-xl border p-4 bg-gray-50">
          {/* ② コード入力エリア */}
          <input
            value={code}
            onChange={e=>setCode(e.target.value)}
            placeholder="商品コード（例: 4900002）"
            className="w-full rounded-lg border px-3 py-2 mb-3"
            onKeyDown={(e)=>e.key==="Enter" && readCode()}
          />
          {/* ① 読み込みボタン */}
          <button
            onClick={readCode}
            disabled={loading}
            className="w-full rounded-lg bg-sky-600 text-white py-2 mb-4 disabled:opacity-50"
          >
            商品コード 読み込み
          </button>

          {/* ③ 名称表示エリア */}
          <input
            value={found ? found.name : (msg ? "商品が見つかりません" : "")}
            readOnly
            placeholder="商品名"
            className="w-full rounded-lg border px-3 py-2 mb-3 bg-white"
          />
          {/* ④ 単価表示エリア */}
          <input
            value={found ? `${found.unit_price} 円` : ""}
            readOnly
            placeholder="単価"
            className="w-full rounded-lg border px-3 py-2 mb-4 bg-white"
          />
          {/* ⑤ 購入リストへ追加 */}
          <button
            onClick={addToList}
            disabled={!found}
            className="w-full rounded-lg bg-emerald-600 text-white py-2 disabled:opacity-50"
          >
            追加
          </button>

          {msg && <p className="mt-3 text-sm text-red-600">{msg}</p>}
        </section>

        {/* 右パネル：⑥ 購入品目リスト ＋ ⑦ 購入ボタン */}
        <section className="rounded-xl border p-4 bg-gray-50">
          <h2 className="mb-3 font-semibold">購入リスト</h2>

          {/* ⑥ 名称/数量/単価/単品合計 */}
          {cart.length === 0 ? (
            <p className="text-gray-500">（空）</p>
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
                {cart.map(l=>(
                  <tr key={l.code} className="border-b">
                    <td className="py-1">{l.name}</td>
                    <td className="py-1 text-center">
                      <button onClick={()=>dec(l.code)} className="px-2 border rounded">-</button>
                      <span className="px-2">{l.quantity}</span>
                      <button onClick={()=>inc(l.code)} className="px-2 border rounded">+</button>
                    </td>
                    <td className="py-1 text-right">{l.unit_price}</td>
                    <td className="py-1 text-right">{l.unit_price * l.quantity}</td>
                    <td className="py-1 text-center"><button onClick={()=>del(l.code)} className="text-red-600">削除</button></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="py-2 text-right font-semibold" colSpan={3}>合計</td>
                  <td className="py-2 text-right font-semibold">{total}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          )}

          {/* ⑦ 購入ボタン */}
          <button
            onClick={doPurchase}
            disabled={cart.length===0 || loading}
            className="mt-4 w-full rounded-lg bg-indigo-600 text-white py-2 disabled:opacity-50"
          >
            購入
          </button>
        </section>
      </div>
    </main>
  );
}
