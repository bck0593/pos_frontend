'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import ClientOnly from '@/components/ClientOnly';
import BarcodeScanner from '@/components/BarcodeScanner';

import {
  health,
  fetchProductByCode,
  postPurchase,
  type ProductOut,
  type PurchaseItem,
} from '@/lib/api';

type Line = ProductOut & { quantity: number };

function formatJPY(value: number) {
  return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(value);
}

export default function POSClient() {
  const [isScannerOpen, setScannerOpen] = useState(false);
  const [backendHealth, setBackendHealth] = useState<'ok' | 'ng'>('ng');

  const [code, setCode] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [price, setPrice] = useState<string>('');
  const [hint, setHint] = useState<string>('');

  const [cart, setCart] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [purchaseMsg, setPurchaseMsg] = useState<string>('');

  const codeInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    health().then(setBackendHealth);
  }, []);

  async function loadProduct(targetCode?: string) {
    const lookupCode = (targetCode ?? code).trim();
    setHint('');
    if (!lookupCode) {
      setHint('商品コードを入力してください');
      return;
    }
    try {
      const product = await fetchProductByCode(lookupCode);
      if (!product) {
        setName('');
        setPrice('');
        setHint('商品が見つかりません');
        return;
      }
      setName(product.name ?? '');
      setPrice(product.price != null ? String(product.price) : '');
    } catch (error) {
      setName('');
      setPrice('');
      const message = error instanceof Error ? error.message : '通信に失敗しました';
      setHint(message);
    }
  }

  function addToCart() {
    if (!code || !name || !price) return;
    const unitPrice = Number(price || 0);
    setCart((prev) => {
      const i = prev.findIndex((l) => l.code === code);
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], quantity: next[i].quantity + 1 };
        return next;
      }
      return [...prev, { code, name, price: unitPrice, quantity: 1 }];
    });
    setCode('');
    setName('');
    setPrice('');
    setHint('');
    setTimeout(() => codeInputRef.current?.focus(), 0);
  }

  function adjustQuantity(targetCode: string, delta: number) {
    setCart((prev) =>
      prev
        .map((l) => (l.code === targetCode ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.quantity > 0),
    );
  }

  function removeLine(targetCode: string) {
    setCart((prev) => prev.filter((l) => l.code !== targetCode));
  }

  const subtotal = useMemo(
    () => cart.reduce((sum, l) => sum + l.price * l.quantity, 0),
    [cart],
  );

  async function purchase() {
    if (!cart.length) return;
    setBusy(true);
    setPurchaseMsg('');
    try {
      const items: PurchaseItem[] = cart.map((l) => ({
        product_code: l.code,
        quantity: l.quantity,
      }));
      const res = await postPurchase({
        emp_cd: '1234567890',
        store_cd: '30',
        pos_no: '090',
        items,
      });
      const taxInfo =
        res.total_amount_ex_tax != null
          ? `（税抜 ${formatJPY(res.total_amount_ex_tax)} / 税込 ${formatJPY(res.total_amount)}）`
          : `合計 ${formatJPY(res.total_amount)}`;
      setPurchaseMsg(`購入が完了しました。${taxInfo}`);
      setCart([]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'unknown';
      setPurchaseMsg(`購入に失敗しました: ${msg}`);
    } finally {
      setBusy(false);
      health().then(setBackendHealth);
    }
  }

  // code が変わったらフォーカス＆選択（スキャン直後の視認性のため）
  useEffect(() => {
    if (!codeInputRef.current) return;
    codeInputRef.current.focus();
    codeInputRef.current.select();
  }, [code]);

  return (
    <main className="mx-auto max-w-sm px-3 pt-4 pb-24">
      <header className="mb-3 text-xs text-gray-500">
        Backend health:{' '}
        <span className={backendHealth === 'ok' ? 'text-green-600' : 'text-red-500'}>
          {backendHealth}
        </span>
      </header>

      <section className="rounded-2xl border shadow-sm p-3 bg-white mb-4">
        <input
          ref={codeInputRef}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          inputMode="numeric"
          placeholder="JAN / 商品コード"
          className="w-full h-12 rounded-xl border px-3 mb-3"
          onKeyDown={(e) => {
            if (e.key === 'Enter') loadProduct();
          }}
        />

        <div className="grid grid-cols-2 gap-2 mb-2">
          <button
            className="w-full h-12 rounded-xl bg-fuchsia-600 text-white font-semibold active:opacity-90"
            onClick={() => setScannerOpen(true)}
          >
            📷 スキャン（カメラ）
          </button>
          <button
            className="w-full h-12 rounded-xl bg-blue-600 text-white font-semibold active:opacity-90"
            onClick={() => loadProduct()}
          >
            商品コードを読み込み
          </button>
        </div>

        {/* 動作確認ボタン（不要なら削除可） */}
        <button
          type="button"
          className="w-full h-10 rounded-xl bg-emerald-100 text-emerald-700 text-sm mb-3"
          onClick={() => {
            const v = '4900000000001';
            if (codeInputRef.current) codeInputRef.current.value = v;
            setCode(v);
            setTimeout(() => loadProduct(v), 0);
          }}
        >
          🔬 テストで「4900000000001」を入力して検索
        </button>

        {hint && <p className="text-sm text-red-500 mb-2">{hint}</p>}

        <input
          value={name ?? ''}
          readOnly
          placeholder="商品名"
          className="w-full h-12 rounded-xl border px-3 mb-2 bg-gray-50"
        />
        <input
          value={price ?? ''}
          readOnly
          placeholder="単価"
          className="w-full h-12 rounded-xl border px-3 mb-3 bg-gray-50"
        />

        <button
          className="w-full h-12 rounded-2xl bg-emerald-500 text-white font-semibold disabled:opacity-50"
          onClick={addToCart}
          disabled={!code || !name || !price}
        >
          追加
        </button>
      </section>

      <section className="rounded-2xl border shadow-sm p-3 bg-white">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">購入リスト</h2>
          <div className="text-sm text-gray-500">小計 {formatJPY(subtotal)}</div>
        </div>
        <hr className="my-2" />
        {cart.length === 0 ? (
          <p className="text-sm text-gray-500">追加された商品はありません。</p>
        ) : (
          <ul className="space-y-3">
            {cart.map((l) => (
              <li key={l.code} className="rounded-2xl border border-gray-200 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-800">{l.name}</p>
                    <p className="text-xs text-gray-500">{l.code}</p>
                  </div>
                  <button
                    className="text-sm text-red-500"
                    onClick={() => removeLine(l.code)}
                    aria-label="行を削除"
                  >
                    🗑
                  </button>
                </div>
                <div className="mt-3 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <button
                      className="h-8 w-8 rounded-full border border-gray-300 text-lg leading-none"
                      onClick={() => adjustQuantity(l.code, -1)}
                      aria-label={`${l.name} を減らす`}
                    >
                      −
                    </button>
                    <span className="min-w-[2rem] text-center text-base font-semibold">
                      {l.quantity}
                    </span>
                    <button
                      className="h-8 w-8 rounded-full border border-gray-300 text-lg leading-none"
                      onClick={() => adjustQuantity(l.code, 1)}
                      aria-label={`${l.name} を増やす`}
                    >
                      ＋
                    </button>
                  </div>
                  <div className="text-right text-sm">
                    <p className="text-gray-500">単価 {formatJPY(l.price)}</p>
                    <p className="font-semibold">{formatJPY(l.price * l.quantity)}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <button
          className="mt-4 w-full h-12 rounded-2xl bg-indigo-500 text-white font-semibold disabled:opacity-50"
          onClick={purchase}
          disabled={busy || cart.length === 0}
        >
          {busy ? '購入中…' : '購入'}
        </button>

        {purchaseMsg && <p className="mt-2 text-sm">{purchaseMsg}</p>}
      </section>

      {/* スキャナは ClientOnly 内、open の時だけマウント */}
      <ClientOnly>
        {isScannerOpen && (
          <BarcodeScanner
            open={isScannerOpen}
            onClose={() => setScannerOpen(false)}
            onDetected={(detectedCode) => {
              const normalized = (detectedCode ?? '').trim();
              if (codeInputRef.current) codeInputRef.current.value = normalized;
              setCode(normalized);
              setScannerOpen(false);
              setTimeout(() => loadProduct(normalized), 0);
            }}
          />
        )}
      </ClientOnly>
    </main>
  );
}
