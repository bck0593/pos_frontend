// src/components/AddToCartSuccessModal.tsx
'use client';

import { useEffect, useRef, useState } from 'react';

type Item = {
  code: string;
  name: string;
  unitPrice: number; // 税込 or 税抜は呼び出し側で統一
  subname?: string;  // 例: 「筒10枚」など
};

type Props = {
  open: boolean;
  item: Item | null;
  initialQty?: number;
  onChangeQty?: (qty: number) => void;
  onContinueScan: (qty: number) => void; // 追加してスキャナ継続
  onFinishScan: (qty: number) => void;   // 追加して終了/閉じる
  onClose?: () => void;                   // Escや外側クリック時
  minQty?: number;
  maxQty?: number;
};

export default function AddToCartSuccessModal({
  open,
  item,
  initialQty = 1,
  onChangeQty,
  onContinueScan,
  onFinishScan,
  onClose,
  minQty = 1,
  maxQty = 99,
}: Props) {
  const [qty, setQty] = useState(initialQty);
  const minusRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    setQty(initialQty);
    // 初期フォーカス
    const t = setTimeout(() => {
      minusRef.current?.focus();
    }, 0);
    return () => clearTimeout(t);
  }, [open, initialQty]);

  useEffect(() => {
    onChangeQty?.(qty);
  }, [qty, onChangeQty]);

  // キーボード: +/- で数量、Enterで「続けてスキャン」、Escで閉じる
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.();
      if (e.key === 'Enter') onContinueScan(qty);
      if (e.key === '+' || e.key === '=') setQty((q) => Math.min(maxQty, q + 1));
      if (e.key === '-' || e.key === '_') setQty((q) => Math.max(minQty, q - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, qty, maxQty, minQty, onClose, onContinueScan]);

  if (!open || !item) return null;

  const inc = () => setQty((q) => Math.min(maxQty, q + 1));
  const dec = () => setQty((q) => Math.max(minQty, q - 1));
  const fmt = (n: number) => n.toLocaleString('ja-JP');

  return (
    <div
      aria-modal="true"
      role="dialog"
      aria-label="商品追加完了"
      className="fixed inset-0 z-[1000] flex items-center justify-center"
    >
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => onClose?.()}
      />
      {/* panel */}
      <div className="relative mx-3 w-[420px] max-w-[92vw] rounded-2xl bg-white shadow-2xl ring-1 ring-black/10 animate-in fade-in zoom-in-95">
        <div className="p-5">
          {/* チェックアイコン風 */}
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-100">
            <span className="text-2xl text-emerald-600">✔</span>
          </div>

          <h2 className="text-center text-lg font-bold text-emerald-700">
            商品追加完了
          </h2>
          <p className="mt-1 text-center text-sm text-gray-600">
            購入リストに商品が追加されました
          </p>

          {/* 商品カード */}
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <p className="text-[15px] font-semibold text-emerald-900 leading-snug">
              {item.name}
            </p>
            {item.subname && (
              <p className="mt-0.5 text-sm text-emerald-800">{item.subname}</p>
            )}
            <div className="mt-1 text-sm text-emerald-700">¥{fmt(item.unitPrice)}</div>

            {/* 数量ステッパー */}
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-emerald-800">数量</span>
              <div className="flex items-center gap-2">
                <button
                  ref={minusRef}
                  type="button"
                  onClick={dec}
                  disabled={qty <= minQty}
                  className="h-9 w-10 rounded-xl bg-white px-2 text-2xl leading-none shadow ring-1 ring-gray-200 enabled:active:scale-[0.98] disabled:opacity-40"
                  aria-label="数量を1減らす"
                >
                  −
                </button>
                <input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={qty}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^\d]/g, '');
                    const n = Math.min(maxQty, Math.max(minQty, Number(v || '0')));
                    setQty(n);
                  }}
                  className="h-9 w-14 rounded-xl border border-gray-200 bg-white text-center text-lg font-semibold"
                  aria-label="数量"
                />
                <button
                  type="button"
                  onClick={inc}
                  disabled={qty >= maxQty}
                  className="h-9 w-10 rounded-xl bg-white px-2 text-2xl leading-none shadow ring-1 ring-gray-200 enabled:active:scale-[0.98] disabled:opacity-40"
                  aria-label="数量を1増やす"
                >
                  ＋
                </button>
              </div>
            </div>

            {/* 小計 */}
            <div className="mt-2 text-right text-sm font-semibold text-emerald-900">
              小計 ¥{fmt(item.unitPrice * qty)}
            </div>
          </div>

          {/* アクション */}
          <div className="mt-5 flex flex-col gap-3">
            <button
              type="button"
              onClick={() => onContinueScan(qty)}
              className="h-12 rounded-2xl bg-blue-600 text-base font-semibold text-white shadow hover:bg-blue-700 active:translate-y-[1px]"
            >
              続けてスキャンする
            </button>
            <button
              type="button"
              onClick={() => onFinishScan(qty)}
              className="h-12 rounded-2xl bg-gray-600 text-base font-semibold text-white shadow hover:bg-gray-700 active:translate-y-[1px]"
            >
              スキャン終わる
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
