'use client';

import { useEffect, useState } from 'react';

type Props = {
  open: boolean;
  item?: { code: string; name: string; unit_price: number };
  onClose: () => void;
  onAdd: (payload: { code: string; qty: number }) => Promise<void> | void;
  onAddAndContinue: (payload: { code: string; qty: number }) => Promise<void> | void;
};

export default function ScanResultModal({
  open,
  item,
  onClose,
  onAdd,
  onAddAndContinue,
}: Props) {
  const [qty, setQty] = useState(1);

  useEffect(() => {
    if (open) setQty(1);
  }, [open]);

  if (!open || !item) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute inset-x-4 top-10 mx-auto w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50">
          <span className="text-3xl">✅</span>
        </div>

        <h3 className="mb-1 text-center text-lg font-bold text-emerald-600">商品追加準備</h3>
        <p className="mb-4 text-center text-sm text-gray-500">購入リストに追加する数量を選んでください</p>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
          <div className="text-sm font-semibold text-gray-800">{item.name}</div>
          <div className="mt-1 text-xs text-gray-500">コード: {item.code}</div>
          <div className="mt-1 text-sm font-semibold text-emerald-700">
            ¥{item.unit_price.toLocaleString()}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <span className="text-sm text-gray-600">数量</span>
          <div className="flex items-center gap-2">
            <button
              className="h-9 w-9 rounded-xl border border-gray-200 text-lg leading-none text-gray-700"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
            >
              −
            </button>
            <input
              className="h-9 w-16 rounded-xl border border-gray-200 text-center text-sm"
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
            />
            <button
              className="h-9 w-9 rounded-xl border border-gray-200 text-lg leading-none text-gray-700"
              onClick={() => setQty((q) => q + 1)}
            >
              ＋
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-2">
          <button
            className="w-full rounded-2xl bg-indigo-600 py-3 text-sm font-semibold text-white shadow hover:opacity-95"
            onClick={() => onAddAndContinue({ code: item.code, qty })}
          >
            追加して続けてスキャンする
          </button>
          <button
            className="w-full rounded-2xl bg-gray-800 py-3 text-sm font-semibold text-white hover:opacity-95"
            onClick={() => onAdd({ code: item.code, qty })}
          >
            追加して終了
          </button>
          <button
            className="w-full rounded-2xl bg-gray-200 py-3 text-sm font-semibold text-gray-700"
            onClick={onClose}
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}
