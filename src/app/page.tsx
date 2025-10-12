// src/app/page.tsx
'use client';

import { useCallback, useState } from 'react';
import POSClient from './POSClient';
import BarcodeScanner from '@/components/BarcodeScanner';
import ScanSuccessModal from '@/components/ScanSuccessModal';

// この簡易フェッチャは /api/products/:code を叩く前提です。
// 既に lib/api があるなら、そちらの fetchProductByCode に置き換えてOK。
async function fetchProductByCode(code: string): Promise<{ name: string; unit_price: number }> {
  const res = await fetch(`/api/products/${code}`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`商品取得に失敗しました (${res.status})`);
  }
  return res.json();
}

export default function Page() {
  const [scannerOpen, setScannerOpen] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [lastItem, setLastItem] = useState<{ name: string; price: number }>();

  const handleDetected = useCallback(async (code: string) => {
    // 1) 商品情報を取得
    const p = await fetchProductByCode(code);

    // 2) カート追加の実処理がある場合はここで呼ぶ
    //    例) await addToCart({ code, qty: 1 })
    // いまはモーダル表示のみ
    setLastItem({ name: p.name, price: p.unit_price });

    // 3) 成功モーダル表示 & スキャナは閉じる（BarcodeScanner 側でストップされます）
    setSuccessOpen(true);
    setScannerOpen(false);
  }, []);

  return (
    <div className="relative">
      {/* 既存の POS 画面 */}
      <POSClient />

      {/* 右下のフローティング「カメラで追加」ボタン */}
      <button
        type="button"
        onClick={() => setScannerOpen(true)}
        className="fixed bottom-6 right-6 z-40 rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-xl hover:opacity-95 active:opacity-90"
      >
        カメラで追加
      </button>

      {/* カメラ・スキャナUI */}
      <BarcodeScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={handleDetected}
      />

      {/* 追加完了モーダル */}
      <ScanSuccessModal
        open={successOpen}
        item={lastItem}
        onContinue={() => {
          setSuccessOpen(false);
          setScannerOpen(true); // 続けてスキャン
        }}
        onFinish={() => {
          setSuccessOpen(false); // 終了（必要ならここで画面遷移やトースト）
        }}
      />
    </div>
  );
}
