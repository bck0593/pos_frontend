/*
README:
- F2 キーでサンプルコード（4901234567890）をスキャンした挙動を再現できます。
- window.POSLv3_onScan(code) を呼び出すとスキャン確認モーダルが表示されます。
- TODO: fetchItem を GET /items/{code}、confirmCheckout を POST /sales に置き換えてください。
*/
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type ItemMaster = {
  code: string;
  name: string;
  unitPrice: number;
};

type CartLine = ItemMaster & {
  quantity: number;
};

type ErrorChip = {
  id: string;
  message: string;
};

type ScanCandidate = {
  item: ItemMaster;
  quantity: number;
};

const ITEM_MASTER: ItemMaster[] = [
  { code: '4901234567890', name: '万年筆 TECH ONE Signature 14K', unitPrice: 28500 },
  { code: '4902345678901', name: 'ボールペン TECH ONE Classic Black', unitPrice: 12800 },
  { code: '4903456789012', name: 'シャープペンシル TECH ONE Precision 0.5mm', unitPrice: 9800 },
  { code: '4904567890123', name: 'ノートブック TECH ONE Premium A5 レザー装丁', unitPrice: 6500 },
  { code: '4905678901234', name: 'レターセット TECH ONE 便箋20枚 封筒10枚', unitPrice: 3200 },
  { code: '4906789012345', name: 'ペンケース イタリアンレザー ブラウン', unitPrice: 8900 },
  { code: '4907890123456', name: 'デスクマット 本革 60x40cm ダークブラウン', unitPrice: 15800 },
  { code: '4908901234567', name: 'ペーパーウェイト 真鍮製 幾何学デザイン', unitPrice: 7400 },
  { code: '4909012345678', name: 'レターオープナー ステンレス製 鏡面仕上げ', unitPrice: 4200 },
  { code: '4910123456789', name: 'インクボトル TECH ONE ブラック 50ml', unitPrice: 2800 },
  { code: '4911234567890', name: '万年筆ケース 1本用 木製ボックス', unitPrice: 5600 },
  { code: '4912345678901', name: 'ブックスタンド 真鍮 アンティーク仕上げ', unitPrice: 11200 },
  { code: '4969757165713', name: 'おえかきちょう', unitPrice: 200 },
];

const ITEM_MASTER_MAP = new Map<string, ItemMaster>(ITEM_MASTER.map((item) => [item.code, item]));

const TAX_RATE = 0.1;

function formatCurrency(value: number): string {
  return `${Math.round(value).toLocaleString('ja-JP')}円`;
}

async function fetchItem(code: string): Promise<ItemMaster | undefined> {
  // TODO: Replace with GET /items/{code}.
  await new Promise((resolve) => setTimeout(resolve, 80));
  return ITEM_MASTER_MAP.get(code);
}

async function confirmCheckout(lines: CartLine[], totals: { taxOut: number; tax: number; taxIn: number }): Promise<void> {
  // TODO: Replace with POST /sales.
  await new Promise((resolve) => setTimeout(resolve, 120));
}

function calculateTotals(cart: CartLine[]) {
  const taxOut = cart.reduce((total, line) => total + line.unitPrice * line.quantity, 0);
  const tax = Math.round(taxOut * TAX_RATE);
  const taxIn = taxOut + tax;
  return { taxOut, tax, taxIn };
}

// ✅ Window のグローバル拡張は declare global で直接書く
declare global {
  interface Window {
    POSLv3_onScan?: (code: string) => void;
  }
}

function ScriptlessBridge({ onScan }: { onScan: (code: string) => void }) {
  useEffect(() => {
    window.POSLv3_onScan = onScan;
    return () => {
      if (window.POSLv3_onScan === onScan) {
        delete window.POSLv3_onScan;
      }
    };
  }, [onScan]);
  return null;
}

export default function POSClient() {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [displayPrice, setDisplayPrice] = useState('');
  const [errors, setErrors] = useState<ErrorChip[]>([]);
  const [completionMessage, setCompletionMessage] = useState('');
  const [scanCandidate, setScanCandidate] = useState<ScanCandidate | null>(null);
  const [isCameraOpen, setCameraOpen] = useState(false);
  const [isCheckoutOpen, setCheckoutOpen] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [qtyIndicator, setQtyIndicator] = useState(1);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastLookupKeyRef = useRef<string | null>(null);

  const totals = useMemo(() => calculateTotals(cart), [cart]);
  const selectedLine = useMemo(() => cart.find((line) => line.code === selectedCode) ?? null, [cart, selectedCode]);

  useEffect(() => {
    if (!selectedLine) {
      setDisplayName('');
      setDisplayPrice('');
      setQtyIndicator(1);
      return;
    }
    setManualCode(selectedLine.code);
    setDisplayName(selectedLine.name);
    setDisplayPrice(formatCurrency(selectedLine.unitPrice));
    setQtyIndicator(selectedLine.quantity);
  }, [selectedLine]);

  useEffect(() => {
    return () => {
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    if (!isCameraOpen) return;
    const video = videoRef.current;
    const stream = cameraStreamRef.current;
    if (video && stream) {
      video.srcObject = stream;
      void video.play().catch(() => undefined);
    }
  }, [isCameraOpen]);

  const resetEntryState = useCallback(() => {
    setSelectedCode(null);
    setManualCode('');
    setDisplayName('');
    setDisplayPrice('');
    setQtyIndicator(1);
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
    resetEntryState();
    setCompletionMessage('カートを空にしました。');
  }, [resetEntryState, setCompletionMessage]);

  const pushError = useCallback((message: string) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setErrors((prev) => [...prev, { id, message }]);
    window.setTimeout(() => {
      setErrors((prev) => prev.filter((chip) => chip.id !== id));
    }, 5000);
  }, []);

  const openScanModalForCode = useCallback(
    async (rawCode: string) => {
      const code = rawCode.trim();
      if (!code) {
        pushError('バーコードを入力してください。');
        return;
      }
      if (!/^\d{13}$/.test(code)) {
        pushError(`コード ${code} は13桁ではありません。`);
        return;
      }
      const item = await fetchItem(code);
      if (!item) {
        pushError(`コード ${code} は未登録です。`);
        return;
      }
      setManualCode(code);
      setDisplayName(item.name);
      setDisplayPrice(formatCurrency(item.unitPrice));
      setQtyIndicator(1);
      setScanCandidate({ item, quantity: 1 });
    },
    [pushError],
  );

  useEffect(() => {
    const trimmed = manualCode.trim();
    if (!trimmed) {
      setDisplayName('');
      setDisplayPrice('');
      setQtyIndicator(1);
      lastLookupKeyRef.current = null;
      return;
    }
    if (!/^\d{13}$/.test(trimmed)) {
      setDisplayName('');
      setDisplayPrice('');
      setQtyIndicator(1);
      lastLookupKeyRef.current = null;
      return;
    }
    let canceled = false;
    (async () => {
      try {
        const item = await fetchItem(trimmed);
        if (canceled) return;
        if (item) {
          setDisplayName(item.name);
          setDisplayPrice(formatCurrency(item.unitPrice));
          setQtyIndicator(1);
          lastLookupKeyRef.current = `success:${trimmed}`;
        } else {
          if (lastLookupKeyRef.current !== `notfound:${trimmed}`) {
            pushError(`コード ${trimmed} は未登録です。`);
          }
          lastLookupKeyRef.current = `notfound:${trimmed}`;
          setDisplayName('');
          setDisplayPrice('');
          setQtyIndicator(1);
        }
      } catch {
        if (canceled) return;
        if (lastLookupKeyRef.current !== `error:${trimmed}`) {
          pushError('商品情報の取得に失敗しました。');
        }
        lastLookupKeyRef.current = `error:${trimmed}`;
        setDisplayName('');
        setDisplayPrice('');
        setQtyIndicator(1);
      }
    })();
    return () => {
      canceled = true;
    };
  }, [manualCode, pushError]);

  const handleAddCandidate = useCallback(() => {
    if (!scanCandidate) return;
    const { item, quantity } = scanCandidate;
    setCart((prev) => {
      const existing = prev.find((line) => line.code === item.code);
      if (existing) {
        return prev.map((line) =>
          line.code === item.code ? { ...line, quantity: line.quantity + quantity } : line,
        );
      }
      return [...prev, { ...item, quantity }];
    });
    setCompletionMessage(`${scanCandidate.item.name} をカートに追加しました。`);
    setScanCandidate(null);
    resetEntryState();
  }, [scanCandidate, resetEntryState]);

  const handleOpenScanner = useCallback(async () => {
    setCompletionMessage('');
    if (!navigator.mediaDevices?.getUserMedia) {
      pushError('この端末ではカメラにアクセスできません。手入力をご利用ください。');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = stream;
      setCameraOpen(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        void videoRef.current.play().catch(() => undefined);
      }
    } catch (error) {
      pushError('カメラへのアクセスが拒否されました。手入力をご利用ください。');
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
      setCameraOpen(false);
    }
  }, [pushError]);

  const handleCloseCamera = useCallback(() => {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    setCameraOpen(false);
  }, []);

  const handleManualSubmit = useCallback(async () => {
    await openScanModalForCode(manualCode);
  }, [manualCode, openScanModalForCode]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'F2') {
        event.preventDefault();
        void openScanModalForCode('4901234567890');
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [openScanModalForCode]);

  const adjustQuantity = useCallback(
    (delta: number) => {
      if (!selectedLine) {
        pushError('行を選択してください。');
        return;
      }
      setCart((prev) =>
        prev.map((line) => {
          if (line.code !== selectedLine.code) return line;
          const nextQty = Math.max(1, line.quantity + delta);
          return { ...line, quantity: nextQty };
        }),
      );
      const nextQty = Math.max(1, selectedLine.quantity + delta);
      setQtyIndicator(nextQty);
    },
    [selectedLine, pushError],
  );

  const handleDeleteLine = useCallback(
    (code: string) => {
      setCart((prev) => prev.filter((line) => line.code !== code));
      if (selectedCode === code) resetEntryState();
      setCompletionMessage('行を削除しました。');
    },
    [resetEntryState, selectedCode],
  );

  const handleConfirmCheckout = useCallback(async () => {
    if (!cart.length) {
      pushError('カートに商品がありません。');
      return;
    }
    setIsConfirming(true);
    try {
      await confirmCheckout(cart, totals);
      setCompletionMessage('会計が完了しました。');
      setCart([]);
      resetEntryState();
      setCheckoutOpen(false);
    } catch {
      pushError('会計処理でエラーが発生しました。');
    } finally {
      setIsConfirming(false);
    }
  }, [cart, totals, pushError, resetEntryState]);

  return (
    <>
      <ScriptlessBridge onScan={(code) => void openScanModalForCode(code)} />
      <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col gap-4 bg-neutral-100 px-4 pb-28 pt-6 text-neutral-900 sm:max-w-md">
        <header
          data-testid="header"
          className="flex items-center justify-between rounded-2xl bg-white px-5 py-4 shadow-sm ring-1 ring-neutral-200"
        >
          <h1 className="text-lg font-semibold">モバイルPOSレジ</h1>
          <button
            type="button"
            aria-label="設定"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-neutral-200 text-neutral-500 hover:bg-neutral-100"
          >
            ⚙️
          </button>
        </header>

        {errors.length > 0 && (
          <div className="space-y-2" aria-live="assertive">
            {errors.map((chip) => (
              <div
                key={chip.id}
                className="flex items-center justify-between rounded-full bg-red-100 px-4 py-2 text-xs text-red-700 ring-1 ring-red-200"
              >
                <span>{chip.message}</span>
                <button
                  type="button"
                  className="ml-3 inline-flex min-h-[28px] min-w-[44px] items-center justify-center rounded-full px-3 text-[11px] font-semibold text-red-700 hover:bg-red-200"
                  onClick={() => setErrors((prev) => prev.filter((item) => item.id !== chip.id))}
                  aria-label="エラーを閉じる"
                >
                  閉じる
                </button>
              </div>
            ))}
          </div>
        )}

        {completionMessage && (
          <div className="rounded-2xl bg-blue-50 px-4 py-3 text-xs text-blue-600 ring-1 ring-blue-200" role="status">
            {completionMessage}
          </div>
        )}

        <section data-testid="scan-card" className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-neutral-200">
          <button
            type="button"
            data-testid="btn-open-scanner"
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500"
            onClick={() => void handleOpenScanner()}
          >
            <span aria-hidden="true">📷</span>
            スキャン（カメラ）
          </button>

          <div className="mt-4 space-y-3">
            <input
              data-testid="input-code"
              value={manualCode}
              onChange={(event) => setManualCode(event.target.value)}
              placeholder="コードを入力/表示"
              className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm text-neutral-800 placeholder:text-neutral-400 shadow-inner"
            />
            <input
              data-testid="input-name"
              value={displayName}
              readOnly
              placeholder="商品名"
              className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm text-neutral-700 shadow-inner"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                data-testid="input-price"
                value={displayPrice}
                readOnly
                placeholder="単価"
                className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm text-neutral-700 shadow-inner"
              />
              <div className="flex items-center justify-between rounded-xl border border-neutral-300 bg-white px-3 py-2">
                <button
                  type="button"
                  data-testid="btn-qty-dec"
                  onClick={() => adjustQuantity(-1)}
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-200 text-lg text-neutral-700 hover:bg-neutral-300"
                  aria-label="数量を1減らす"
                >
                  −
                </button>
                <div className="text-center text-sm font-semibold text-neutral-700">
                  {selectedLine ? `${selectedLine.quantity}個` : `${qtyIndicator}個`}
                </div>
                <button
                  type="button"
                  data-testid="btn-qty-inc"
                  onClick={() => adjustQuantity(1)}
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-200 text-lg text-neutral-700 hover:bg-neutral-300"
                  aria-label="数量を1増やす"
                >
                  ＋
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void handleManualSubmit()}
              data-testid="btn-add-to-cart"
              className="w-full rounded-2xl border border-blue-200 bg-blue-50 py-3 text-sm font-semibold text-blue-600 hover:bg-blue-100"
            >
              カートへ追加
            </button>
          </div>
        </section>

        <section data-testid="cart" className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-neutral-200">
          <div data-testid="cart-header" className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-neutral-800">カート</h2>
            <button
              type="button"
              data-testid="btn-clear-cart"
              onClick={clearCart}
              className="rounded-lg bg-rose-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={cart.length === 0}
            >
              カートを空にする
            </button>
          </div>
          <ul className="mt-3 space-y-2" role="listbox" aria-label="カート">
            {cart.length === 0 ? (
              <li className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-6 text-center text-xs text-neutral-500">
                スキャンまたはコード追加で商品を登録してください。
              </li>
            ) : (
              cart.map((line) => {
                const isSelected = line.code === selectedCode;
                return (
                  <li
                    key={line.code}
                    data-testid="cart-row"
                    data-code={line.code}
                    aria-selected={isSelected}
                    className={`flex items-center gap-3 rounded-xl border p-3 transition ${
                      isSelected ? 'border-blue-300 bg-blue-100' : 'border-neutral-200 bg-white hover:border-blue-200'
                    }`}
                    role="option"
                    tabIndex={0}
                    onClick={() => setSelectedCode(line.code)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setSelectedCode(line.code);
                      }
                    }}
                  >
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-neutral-800">{line.name}</p>
                      <p className="mt-1 text-xs text-neutral-500">
                        {formatCurrency(line.unitPrice)} / {line.quantity}個
                      </p>
                    </div>
                    <span aria-hidden="true" className="text-neutral-400">
                      ↕︎
                    </span>
                    <div className="text-right text-sm font-semibold text-neutral-800">
                      {formatCurrency(line.unitPrice * line.quantity)}
                    </div>
                    <button
                      type="button"
                      data-testid="btn-row-delete"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleDeleteLine(line.code);
                      }}
                      className="ml-2 flex h-9 w-9 items-center justify-center rounded-full bg-neutral-200 text-sm text-neutral-600 hover:bg-neutral-300"
                      aria-label={`${line.name} を削除`}
                    >
                      🗑
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </section>
      </main>

      <div
        data-testid="footerbar"
        className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-sm px-4 pb-4 pt-2 sm:max-w-md"
      >
        <div className="rounded-3xl bg-white p-4 shadow-lg ring-1 ring-neutral-200">
          <div className="flex items-center justify-between text-xs text-neutral-500">
            <span>うち税額</span>
            <span data-testid="total-tax" className="font-medium text-neutral-700">
              {formatCurrency(totals.tax)}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between text-sm text-neutral-500">
            <span>合計（税込）</span>
            <span data-testid="total-taxin" className="text-lg font-semibold text-neutral-900">
              {formatCurrency(totals.taxIn)}
            </span>
          </div>
          <button
            type="button"
            data-testid="btn-checkout"
            onClick={() => setCheckoutOpen(true)}
            className="mt-3 w-full rounded-2xl bg-blue-600 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={cart.length === 0}
          >
            購入
          </button>
        </div>
      </div>

      {isCameraOpen && (
        <div data-testid="modal-scanner" className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl ring-1 ring-neutral-200">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-neutral-900">カメラで追加</h2>
              <span
                data-testid="label-scanning"
                className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-600"
              >
                スキャン中…
              </span>
            </div>
            <div className="mt-4 overflow-hidden rounded-3xl bg-neutral-200">
              <div className="relative aspect-[4/3] w-full">
                <video ref={videoRef} data-testid="video" className="h-full w-full object-cover" autoPlay muted playsInline />
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div
                    data-testid="overlay-guide"
                    className="h-44 w-72 rounded-[32px] border-[6px] border-red-400/80 shadow-[0_0_48px_rgba(248,113,113,0.35)]"
                  />
                </div>
              </div>
            </div>
            <div data-testid="tips" className="mt-5 rounded-2xl bg-neutral-50 p-4 text-xs text-neutral-600 ring-1 ring-neutral-200">
              <h3 className="text-sm font-semibold text-neutral-800">スキャンのコツ</h3>
              <ul className="mt-2 space-y-1">
                <li>・バーコードを赤い枠に合わせる（端に寄せすぎない）</li>
                <li>・15〜25cmの距離を保つ</li>
                <li>・明るい場所で手ブレを抑える</li>
              </ul>
            </div>
            <button
              type="button"
              data-testid="btn-close-scanner"
              onClick={handleCloseCamera}
              className="mt-6 w-full rounded-2xl border border-neutral-300 bg-white py-3 text-sm font-semibold text-neutral-600 hover:bg-neutral-100"
            >
              閉じる
            </button>
          </div>
        </div>
      )}

      {scanCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div
            data-testid="modal-scan-confirm"
            className="w-full max-w-xs rounded-3xl bg-white p-5 shadow-xl ring-1 ring-neutral-200"
            role="dialog"
            aria-modal="true"
          >
            <h2 className="text-base font-semibold text-neutral-900">読み取り内容の確認</h2>
            <div className="mt-3 space-y-2 text-sm text-neutral-700">
              <p className="font-semibold">{scanCandidate.item.name}</p>
              <p className="text-xs text-neutral-500">コード: {scanCandidate.item.code}</p>
              <p>単価（税抜）: {formatCurrency(scanCandidate.item.unitPrice)}</p>
              <p>数量: {scanCandidate.quantity}</p>
              <div className="mt-3 rounded-2xl bg-neutral-50 p-3 text-xs text-neutral-600 ring-1 ring-neutral-200">
                <div className="flex justify-between">
                  <span>小計（税抜）</span>
                  <span>{formatCurrency(scanCandidate.item.unitPrice * scanCandidate.quantity)}</span>
                </div>
                <div className="flex justify-between">
                  <span>小計（税込）</span>
                  <span>{formatCurrency(Math.round(scanCandidate.item.unitPrice * scanCandidate.quantity * (1 + TAX_RATE)))}</span>
                </div>
              </div>
            </div>
            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                data-testid="btn-confirm-add"
                onClick={handleAddCandidate}
                className="w-full rounded-2xl bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-500"
              >
                追加
              </button>
              <button
                type="button"
                data-testid="btn-cancel-add"
                onClick={() => setScanCandidate(null)}
                className="w-full rounded-2xl border border-neutral-300 bg-white py-3 text-sm font-semibold text-neutral-600 hover:bg-neutral-100"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {isCheckoutOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div data-testid="modal-checkout" role="dialog" aria-modal="true" className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl ring-1 ring-neutral-200">
            <h2 className="text-base font-semibold text-neutral-900">会計内容の確認</h2>
            <div data-testid="modal-lines" className="mt-4 max-h-64 space-y-3 overflow-y-auto pr-1">
              {cart.map((line) => (
                <div key={`modal-${line.code}`} className="rounded-2xl bg-neutral-50 p-4 ring-1 ring-neutral-200">
                  <div className="flex items-start justify-between text-xs text-neutral-600">
                    <div>
                      <p className="text-sm font-semibold text-neutral-900">{line.name}</p>
                      <p className="text-[11px] text-neutral-500">{line.code}</p>
                    </div>
                    <span>{line.quantity} 点 × {formatCurrency(line.unitPrice)}</span>
                  </div>
                  <p className="mt-2 text-right text-sm font-semibold text-blue-600">
                    {formatCurrency(line.unitPrice * line.quantity)}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-6 space-y-2 text-sm text-neutral-600">
              <div className="flex items-center justify-between">
                <span>合計（税抜）</span>
                <span data-testid="total-taxout">{formatCurrency(totals.taxOut)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>税額（10%）</span>
                <span data-testid="total-tax">{formatCurrency(totals.tax)}</span>
              </div>
              <div className="flex items-center justify-between text-base font-semibold text-neutral-900">
                <span>合計（税込）</span>
                <span data-testid="total-taxin">{formatCurrency(totals.taxIn)}</span>
              </div>
            </div>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                data-testid="btn-close-checkout"
                onClick={() => setCheckoutOpen(false)}
                className="min-h-[48px] flex-1 rounded-2xl border border-neutral-300 bg-white text-sm font-semibold text-neutral-600 hover:bg-neutral-100"
              >
                戻る
              </button>
              <button
                type="button"
                data-testid="btn-confirm-checkout"
                onClick={() => void handleConfirmCheckout()}
                disabled={isConfirming}
                className="min-h-[48px] flex-1 rounded-2xl bg-blue-600 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isConfirming ? '処理中…' : '確定して会計'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
