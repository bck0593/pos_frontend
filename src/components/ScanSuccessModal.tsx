'use client';
import React from 'react';

type Props = {
  open: boolean;
  item?: { name: string; price: number };
  onContinue: () => void;   // 続けてスキャン
  onFinish: () => void;     // スキャン終わる
};

export default function ScanSuccessModal({ open, item, onContinue, onFinish }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-black/60" />
      <div className="absolute inset-x-4 top-12 mx-auto w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl">
        {/* アイコン */}
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-green-100">
          <span className="text-4xl">✅</span>
        </div>

        {/* 見出し/説明 */}
        <h3 className="mb-1 text-center text-xl font-bold text-green-700">商品追加完了</h3>
        <p className="mb-4 text-center text-sm text-gray-600">購入リストに商品が追加されました</p>

        {/* 追加した商品 */}
        {item && (
          <div className="mb-5 rounded-2xl border border-green-200 bg-green-50 p-4">
            <p className="font-semibold text-gray-800">{item.name}</p>
            <p className="mt-1 text-sm text-green-700">
              ¥{item.price.toLocaleString()}
            </p>
          </div>
        )}

        {/* ボタン */}
        <div className="space-y-3">
          <button
            className="w-full rounded-2xl bg-indigo-600 py-3 text-sm font-semibold text-white active:opacity-90"
            onClick={onContinue}
          >
            続けてスキャンする
          </button>
          <button
            className="w-full rounded-2xl bg-gray-500 py-3 text-sm font-semibold text-white active:opacity-90"
            onClick={onFinish}
          >
            スキャン終わる
          </button>
        </div>
      </div>
    </div>
  );
}
