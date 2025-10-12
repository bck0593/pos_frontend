'use client';

import { useEffect, useState } from 'react';
import POSClient from './POSClient';
import BarcodeScanner from '@/components/BarcodeScanner';
import ScanResultModal from '@/components/ScanResultModal';

// API: 既存の fetch を使うなら置き換えてOK
async function fetchProductByCode(code: string): Promise<{ code: string; name: string; unit_price: number }> {
  const res = await fetch(`/api/products/${code}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`商品取得に失敗しました (${res.status})`);
  return res.json();
}

// カート追加の実処理がある場合はここで差し替え
async function addToCart(payload: { code: string; qty: number }) {
  // 例: await fetch('/api/cart', { method: 'POST', body: JSON.stringify(payload) })
  console.log('[addToCart]', payload);
}

export default function Page() {
  const [scannerOpen, setScannerOpen] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [scannedItem, setScannedItem] = useState<{ code: string; name: string; unit_price: number }>();

  // POSClient 内の「スキャン（カメラ）」ボタンから起動するための event 連携
  useEffect(() => {
    const handler = () => setScannerOpen(true);
    window.addEventListener('open-scanner', handler);
    return () => window.removeEventListener('open-scanner', handler);
  }, []);

  return (
    <div className="relative">
      <POSClient />

      {/* スキャナ：検出→商品取得→結果モーダル */}
      <BarcodeScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={async (code) => {
          try {
            const p = await fetchProductByCode(code);
            setScannedItem(p);
            setResultOpen(true);
          } catch (e) {
            alert((e as Error).message || '商品取得に失敗しました');
          }
        }}
      />

      {/* 数量調整＆追加モーダル */}
      <ScanResultModal
        open={resultOpen}
        item={scannedItem}
        onClose={() => setResultOpen(false)}
        onAdd={async ({ code, qty }) => {
          await addToCart({ code, qty });
          setResultOpen(false); // 終了
        }}
        onAddAndContinue={async ({ code, qty }) => {
          await addToCart({ code, qty });
          setResultOpen(false);
          setScannerOpen(true); // 連続スキャン
        }}
      />
    </div>
  );
}
