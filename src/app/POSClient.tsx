'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// ✨ 変更点：BarcodeScanner を動的 import（SSR無効）
import dynamic from 'next/dynamic';
const BarcodeScanner = dynamic(() => import('../components/BarcodeScanner'), { ssr: false });

// ✅ 追加：スキャン成功モーダル（数量±付き）
import AddToCartSuccessModal from '@/components/AddToCartSuccessModal';

// ✅ [Stripe] 追加：Hosted Checkout 起動ヘルパ
import { startStripeCheckout } from '@/lib/pay';

import {
  fetchProductByCode,
  submitPurchase,
  type PurchaseLineRequest,
  type PurchaseResponse,
} from '../lib/api';
import {
  getValidEAN13,
  isValidEAN13,
  normalizeEAN13,
  sanitizeEAN13Input,
} from '../lib/validators';

// ===== 型 =====
export type ItemMaster = {
  code: string;
  name: string;
  unitPrice: number;
};

export type CartLine = ItemMaster & {
  quantity: number;
};

export type ErrorChip = {
  id: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

export type Totals = {
  taxOut: number;
  tax: number;
  taxIn: number;
};

// ===== 定数 =====
const TAX_PERCENT = 10;
const TAX_RATE = TAX_PERCENT / 100;
const MIN_QUANTITY = 1;
const MAX_QUANTITY = 99; // ★ 999→99 に変更
const SCAN_DUPLICATE_GUARD_MS = 1200;

// ===== Util =====
function clampQuantity(value: number): number {
  if (!Number.isFinite(value)) return MIN_QUANTITY;
  const truncated = Math.trunc(value);
  return Math.min(Math.max(truncated, MIN_QUANTITY), MAX_QUANTITY);
}

function formatCurrency(value: number): string {
  return `${Math.round(value).toLocaleString('ja-JP')}円`;
}

function calculateTotals(cart: CartLine[]): Totals {
  const taxOut = cart.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  const tax = Math.round(taxOut * TAX_RATE);
  const taxIn = taxOut + tax;
  return { taxOut, tax, taxIn };
}

// ===== window ブリッジ（任意） =====
declare global {
  interface Window {
    POSLv3_onScan?: (code: string) => void;
  }
}

function ScriptlessBridge({ onScan }: { onScan: (code: string) => void }) {
  useEffect(() => {
    window.POSLv3_onScan = onScan;
    return () => {
      if (window.POSLv3_onScan === onScan) delete window.POSLv3_onScan;
    };
  }, [onScan]);
  return null;
}

// ===== メイン =====
export default function POSClient() {
  // カート & 入力系
  const [cart, setCart] = useState<CartLine[]>([]);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [pendingProduct, setPendingProduct] = useState<ItemMaster | null>(null);
  const [pendingQuantity, setPendingQuantity] = useState(1);

  // UI 状態
  const [errors, setErrors] = useState<ErrorChip[]>([]);
  const [toastMessage, setToastMessage] = useState('');
  const [isScannerOpen, setScannerOpen] = useState(false);
  const [isCheckoutOpen, setCheckoutOpen] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  // ✅ 追加：スキャン成功モーダルの状態
  const [isSuccessOpen, setSuccessOpen] = useState(false);
  const [successItem, setSuccessItem] = useState<ItemMaster | null>(null);
  const [successQty, setSuccessQty] = useState<number>(1);

  // Ref
  const lastLookupKeyRef = useRef<string | null>(null);
  const lastInvalidCodeRef = useRef<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const lastScanRef = useRef<{ code: string; timestamp: number } | null>(null);
  const quantityInputRef = useRef<HTMLInputElement | null>(null);
  const scannerButtonRef = useRef<HTMLButtonElement | null>(null);

  const totals = useMemo(() => calculateTotals(cart), [cart]);
  const selectedLine = useMemo(
    () => (selectedCode ? cart.find((line) => line.code === selectedCode) ?? null : null),
    [cart, selectedCode],
  );

  // ===== 共通関数 =====
  const resetManualFields = useCallback(() => {
    setManualCode('');
    setPendingProduct(null);
    setPendingQuantity(MIN_QUANTITY);
    lastLookupKeyRef.current = null;
    lastInvalidCodeRef.current = null;
  }, []);

  const pushError = useCallback(
    (message: string, action?: { label: string; handler: () => void }) => {
      const id = Math.random().toString(36).slice(2);
      setErrors((prev) => [
        ...prev,
        { id, message, actionLabel: action?.label, onAction: action?.handler },
      ]);
      window.setTimeout(() => {
        setErrors((prev) => prev.filter((chip) => chip.id !== id));
      }, 6000);
    },
    [],
  );

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage('');
      toastTimerRef.current = null;
    }, 2400);
  }, []);

  const applyCartSelection = useCallback(
    (code: string) => {
      const line = cart.find((item) => item.code === code);
      if (!line) return;
      setSelectedCode(code);
      setManualCode(code);
      setPendingProduct({ code: line.code, name: line.name, unitPrice: line.unitPrice });
      setPendingQuantity(line.quantity);
      lastLookupKeyRef.current = code;
      lastInvalidCodeRef.current = null;
      window.requestAnimationFrame(() => quantityInputRef.current?.focus());
    },
    [cart],
  );

  const addOrIncrementProduct = useCallback(
    (product: ItemMaster, quantity: number, options: { updateManualFields?: boolean; focusQuantityOnInsert?: boolean } = {}) => {
      if (quantity <= 0) {
        showToast('数量は1点以上で入力してください。');
        return;
      }
      const { updateManualFields = true, focusQuantityOnInsert = true } = options;
      const safeQuantity = clampQuantity(quantity);
      if (safeQuantity !== quantity) {
        showToast(`数量は${MIN_QUANTITY}〜${MAX_QUANTITY}点の範囲で追加されます。`);
      }

      let applied = false;
      let wasExisting = false;
      let finalQuantity = safeQuantity;

      setCart((prev) => {
        const existing = prev.find((line) => line.code === product.code);
        if (existing) {
          wasExisting = true;
          const nextQuantity = clampQuantity(existing.quantity + safeQuantity);
          const added = nextQuantity - existing.quantity;
          finalQuantity = nextQuantity;
          if (added <= 0) {
            showToast(`数量は${MAX_QUANTITY}点までです。`);
            return prev;
          }
          applied = true;
          return prev.map((line) =>
            line.code === product.code ? { ...line, quantity: nextQuantity } : line,
          );
        }
        applied = true;
        return [...prev, { ...product, quantity: safeQuantity }];
      });

      if (!applied) return;

      setSelectedCode(product.code);
      setPendingQuantity(finalQuantity);
      if (updateManualFields) {
        setManualCode(product.code);
        setPendingProduct(product);
        lastLookupKeyRef.current = product.code;
        lastInvalidCodeRef.current = null;
      }

      if (wasExisting) {
        showToast(`${product.name}を${safeQuantity}点追加（合計 ${finalQuantity}点）しました。`);
        window.requestAnimationFrame(() => scannerButtonRef.current?.focus());
      } else {
        showToast(`${product.name}を${finalQuantity}点で追加しました。`);
        if (focusQuantityOnInsert) {
          window.requestAnimationFrame(() => quantityInputRef.current?.focus());
        }
      }
    },
    [showToast],
  );

  const handleManualAdd = useCallback(async () => {
    const normalizedCode = getValidEAN13(manualCode);
    if (!normalizedCode) {
      pushError('有効なバーコードを入力してください。');
      lastInvalidCodeRef.current = manualCode;
      return;
    }
    lastInvalidCodeRef.current = null;

    const safeQuantity = clampQuantity(pendingQuantity);
    if (safeQuantity !== pendingQuantity) {
      showToast(`数量は${MIN_QUANTITY}〜${MAX_QUANTITY}点の範囲で入力してください。`);
      setPendingQuantity(safeQuantity);
    }

    let product = pendingProduct;
    if (!product || product.code !== normalizedCode) {
      try {
        const fetched = await fetchProductByCode(normalizedCode);
        if (!fetched) {
          pushError(`コード ${normalizedCode} は登録されていません。`);
          return;
        }
        product = { code: fetched.code, name: fetched.name, unitPrice: fetched.unit_price };
      } catch {
        pushError('商品情報の取得に失敗しました。', {
          label: '再試行',
          handler: () => void handleManualAdd(),
        });
        return;
      }
    }

    addOrIncrementProduct(product, safeQuantity);
    setPendingQuantity(MIN_QUANTITY);
    setPendingProduct(null);
    setManualCode('');
    lastLookupKeyRef.current = null;
    window.requestAnimationFrame(() => scannerButtonRef.current?.focus());
  }, [addOrIncrementProduct, manualCode, pendingProduct, pendingQuantity, pushError, showToast]);

  const handleDeleteLine = useCallback(
    (code: string | null) => {
      if (!code) return;
      const line = cart.find((item) => item.code === code);
      if (!line) return;
      setCart((prev) => prev.filter((item) => item.code !== code));
      if (selectedCode === code) {
        setSelectedCode(null);
        resetManualFields();
      }
      showToast(`${line.name}を削除しました。`);
    },
    [cart, resetManualFields, selectedCode, showToast],
  );

  const handleClearCart = useCallback(() => {
    if (!cart.length) return;
    setCart([]);
    setSelectedCode(null);
    resetManualFields();
    showToast('カートをクリアしました。');
  }, [cart.length, resetManualFields, showToast]);

  const adjustQuantity = useCallback(
    (delta: number) => {
      setPendingQuantity((prev) => {
        const next = clampQuantity(prev + delta);
        if (next === prev) {
          if (prev === MIN_QUANTITY && delta < 0) showToast('数量は1点以上です。');
          else if (prev === MAX_QUANTITY && delta > 0) showToast(`数量は${MAX_QUANTITY}点までです。`);
          return prev;
        }
        return next;
      });
    },
    [showToast],
  );

  const handleQuantityInputChange = useCallback(
    (rawValue: string) => {
      const sanitized = rawValue.trim();
      if (!sanitized) {
        setPendingQuantity(MIN_QUANTITY);
        return;
      }
      const parsed = Number.parseInt(sanitized, 10);
      const next = clampQuantity(Number.isNaN(parsed) ? MIN_QUANTITY : parsed);
      if (!Number.isNaN(parsed) && next !== parsed) {
        showToast(`数量は${MIN_QUANTITY}〜${MAX_QUANTITY}点の範囲で入力してください。`);
      }
      setPendingQuantity(next);
    },
    [showToast],
  );

  const handleConfirmCheckout = useCallback(async () => {
    if (cart.length === 0) {
      pushError('カートが空です。');
      return;
    }
    const payload: PurchaseLineRequest[] = cart.map((line) => ({ code: line.code, qty: line.quantity }));

    setIsConfirming(true);
    try {
      const response: PurchaseResponse = await submitPurchase(payload);
      setCart([]);
      setSelectedCode(null);
      resetManualFields();
      setCheckoutOpen(false);
      showToast(`取引を登録しました（合計 ${formatCurrency(response.total_amt)}）。`);
    } catch {
      pushError('会計処理でエラーが発生しました。', {
        label: 'もう一度購入',
        handler: () => void handleConfirmCheckout(),
      });
    } finally {
      setIsConfirming(false);
    }
  }, [cart, pushError, resetManualFields, showToast]);

  // ✅ [Stripe] 追加：Stripe会計（Hosted Checkout → WebhookでDB登録）
  const handleStripeCheckout = useCallback(async () => {
    if (cart.length === 0) {
      pushError('カートが空です。');
      return;
    }
    setIsConfirming(true);
    setToastMessage('');
    try {
      await startStripeCheckout(
        cart.map((c) => ({
          code: c.code,
          name: c.name,
          unitPrice: c.unitPrice,
          quantity: c.quantity,
        })),
      );
      // Hosted Checkout にリダイレクトされる想定。戻ってくるのは /success or /cancel
    } catch (e: any) {
      pushError(e?.message ?? 'Stripeの起動に失敗しました。', {
        label: 'もう一度',
        handler: () => void handleStripeCheckout(),
      });
      setIsConfirming(false);
    }
  }, [cart, pushError]);

  // ===== スキャン処理 =====
  const openSuccessModal = useCallback((item: ItemMaster) => {
    setSuccessItem(item);
    setSuccessQty(1);
    setSuccessOpen(true);
  }, []);

  const handleScanDetected = useCallback(
    async (rawCode: string) => {
      const normalizedInput = normalizeEAN13(rawCode);
      const validCode = getValidEAN13(normalizedInput);
      if (!validCode) {
        if (lastInvalidCodeRef.current !== normalizedInput) {
          pushError('無効なバーコードです。');
          lastInvalidCodeRef.current = normalizedInput;
        }
        return;
      }
      lastInvalidCodeRef.current = null;

      const now = Date.now();
      if (
        lastScanRef.current &&
        lastScanRef.current.code === validCode &&
        now - lastScanRef.current.timestamp < SCAN_DUPLICATE_GUARD_MS
      ) {
        return; // 二重読み取り防止
      }
      lastScanRef.current = { code: validCode, timestamp: now };

      try {
        const product = await fetchProductByCode(validCode);
        if (!product) {
          pushError(`コード ${validCode} は登録されていません。`);
          return;
        }
        // ✅ ここで即カート追加せずモーダルを開く
        openSuccessModal({ code: product.code, name: product.name, unitPrice: product.unit_price });
      } catch {
        pushError('バーコードの読み込みに失敗しました。', {
          label: '再スキャン',
          handler: () => void handleScanDetected(validCode),
        });
      }
    },
    [openSuccessModal, pushError],
  );

  // ===== 手入力コード監視（既存維持） =====
  useEffect(() => {
    const sanitized = sanitizeEAN13Input(manualCode);
    if (sanitized !== manualCode) {
      setManualCode(sanitized);
      return;
    }

    if (!sanitized) {
      if (!selectedLine) {
        setPendingProduct(null);
        setPendingQuantity(MIN_QUANTITY);
      }
      lastLookupKeyRef.current = null;
      return;
    }

    if (sanitized.length < 13) {
      if (!selectedLine) {
        setPendingProduct(null);
        setPendingQuantity(MIN_QUANTITY);
      }
      lastLookupKeyRef.current = null;
      return;
    }

    if (!isValidEAN13(sanitized)) {
      if (lastInvalidCodeRef.current !== sanitized) {
        pushError('無効なバーコードです。');
        lastInvalidCodeRef.current = sanitized;
      }
      setPendingProduct(null);
      lastLookupKeyRef.current = null;
      return;
    }
    lastInvalidCodeRef.current = null;

    if (lastLookupKeyRef.current === sanitized) return;

    let cancelled = false;
    (async () => {
      try {
        const product = await fetchProductByCode(sanitized);
        if (cancelled) return;
        if (product) {
          setPendingProduct({ code: product.code, name: product.name, unitPrice: product.unit_price });
          lastLookupKeyRef.current = sanitized;
          if (!selectedLine) window.requestAnimationFrame(() => quantityInputRef.current?.focus());
        } else {
          setPendingProduct(null);
          lastLookupKeyRef.current = null;
        }
      } catch {
        if (!cancelled) {
          pushError('商品情報の取得に失敗しました。');
          setPendingProduct(null);
          lastLookupKeyRef.current = null;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [manualCode, pushError, selectedLine]);

  useEffect(
    () => () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    },
    [],
  );

  // ===== JSX =====
  return (
    <>
      <ScriptlessBridge onScan={(code) => void handleScanDetected(code)} />

      <main className="mx-auto flex min-h-screen w-full max-w-[360px] flex-col gap-6 bg-[#f4f6fb] px-4 pb-28 pt-6 text-neutral-900">
        <header className="flex items-center justify-between rounded-2xl bg-white px-5 py-4 shadow-lg shadow-blue-100/40 ring-1 ring-white">
          <h1 className="text-lg font-semibold text-neutral-900">モバイルPOSレジ</h1>
          <button
            type="button"
            aria-label="設定"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-500 transition hover:bg-neutral-100"
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
                <div className="ml-3 flex items-center gap-2">
                  {chip.actionLabel && chip.onAction && (
                    <button
                      type="button"
                      className="inline-flex min-h-[28px] min-w-[56px] items-center justify-center rounded-full bg-red-200 px-3 text-[11px] font-semibold text-red-700 hover:bg-red-300"
                      onClick={() => chip.onAction?.()}
                    >
                      {chip.actionLabel}
                    </button>
                  )}
                  <button
                    type="button"
                    className="inline-flex min-h-[28px] min-w-[44px] items-center justify-center rounded-full px-3 text-[11px] font-semibold text-red-700 hover:bg-red-200"
                    onClick={() => setErrors((prev) => prev.filter((item) => item.id !== chip.id))}
                    aria-label="エラーを閉じる"
                  >
                    閉じる
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {toastMessage && (
          <div className="rounded-2xl bg-blue-50 px-4 py-3 text-xs text-blue-600 ring-1 ring-blue-200" role="status">
            {toastMessage}
          </div>
        )}

        <section className="rounded-[28px] bg-white p-5 shadow-xl shadow-blue-100/40 ring-1 ring-white">
          <button
            ref={scannerButtonRef}
            type="button"
            className="flex min-h-[50px] w-full items-center justify-center gap-2 rounded-2xl bg-[#1660ff] text-sm font-semibold text-white shadow-lg shadow-blue-300/40 transition hover:bg-[#0f4de0]"
            onClick={() => setScannerOpen(true)}
          >
            <span aria-hidden="true">📷</span>
            スキャン（カメラ）
          </button>

          <div className="mt-4 space-y-3 text-sm">
            <input
              value={manualCode}
              onChange={(event) => {
                const sanitized = sanitizeEAN13Input(event.target.value);
                setManualCode(sanitized);
                setSelectedCode(null);
                if (sanitized.length < 13) setPendingProduct(null);
              }}
              placeholder="バーコード入力 / スキャン番号"
              className="w-full rounded-2xl border border-[#e3e8ff] bg白 px-4 py-3 text-sm text-neutral-800 shadow-inner shadow-blue-100/30 placeholder:text-neutral-400"
            />
            <input
              value={pendingProduct?.name ?? ''}
              readOnly
              placeholder="商品名"
              className="w-full rounded-2xl border border-[#e3e8ff] bg-white px-4 py-3 text-sm text-neutral-700 shadow-inner shadow-blue-100/30"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                value={pendingProduct ? formatCurrency(pendingProduct.unitPrice) : ''}
                readOnly
                placeholder="単価"
                className="w-full rounded-2xl border border-[#e3e8ff] bg-white px-4 py-3 text-sm text-neutral-700 shadow-inner shadow-blue-100/30"
              />
              <div className="flex items-center justify-between rounded-2xl border border-[#e3e8ff] bg-white px-3 py-2 shadow-inner shadow-blue-100/30">
                <button
                  type="button"
                  onClick={() => setPendingQuantity((q) => clampQuantity(q - 1))}
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#eef2ff] text-lg font-semibold text-neutral-700 transition hover:bg-[#dde4ff]"
                  aria-label="数量を1減らす"
                >
                  －
                </button>
                <input
                  ref={quantityInputRef}
                  type="number"
                  inputMode="numeric"
                  min={MIN_QUANTITY}
                  max={MAX_QUANTITY}
                  value={pendingQuantity}
                  onChange={(event) => handleQuantityInputChange(event.target.value)}
                  className="w-16 text-center text-sm font-semibold text-neutral-700 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setPendingQuantity((q) => clampQuantity(q + 1))}
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#eef2ff] text-lg font-semibold text-neutral-700 transition hover:bg-[#dde4ff]"
                  aria-label="数量を1増やす"
                >
                  ＋
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => void handleManualAdd()}
                className="w-full rounded-2xl border border-[#b9caff] bg-[#e8edff] py-3 text-sm font-semibold text-[#1d4ed8] shadow-inner shadow-blue-100/40 transition hover:bg-[#dbe4ff]"
              >
                カートへ追加
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] bg-white p-5 shadow-xl shadow-blue-100/40 ring-1 ring-white">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-neutral-900">カート</h2>
            <button
              type="button"
              onClick={handleClearCart}
              className="rounded-2xl border border-[#ffa5bd] bg-[#ffe1eb] px-3 py-2 text-xs font-semibold text-[#d81b60] transition hover:bg-[#ffc6d8] disabled:cursor-not-allowed disabled:opacity-40"
              disabled={cart.length === 0}
            >
              カートを空にする
            </button>
          </div>
          <ul className="mt-3 space-y-2" role="listbox" aria-label="カート">
            {cart.length === 0 ? (
              <li className="rounded-2xl border border-dashed border-[#d9dffa] bg-[#f6f7ff] p-6 text-center text-xs text-neutral-500">
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
                    className={`flex items-center gap-3 rounded-2xl border p-3 transition ${
                      isSelected
                        ? 'border-[#6b8bff] bg-[#eef2ff] ring-2 ring-[#b9caff]'
                        : 'border-[#e4e7fb] bg-white hover:border-[#b9caff]'
                    }`}
                    role="option"
                    tabIndex={0}
                    onClick={() => applyCartSelection(line.code)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        applyCartSelection(line.code);
                      }
                    }}
                  >
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-neutral-800">{line.name}</p>
                      <p className="mt-1 text-xs text-neutral-500">
                        {formatCurrency(line.unitPrice)} ／ {line.quantity}点
                      </p>
                    </div>
                    <div className="text-right text-sm font-semibold text-neutral-800">
                      {formatCurrency(line.unitPrice * line.quantity)}
                    </div>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleDeleteLine(line.code);
                      }}
                      className="ml-2 flex h-9 w-9 items-center justify-center rounded-full bg-[#eef2ff] text-sm text-neutral-600 transition hover:bg-[#dde4ff]"
                      aria-label={`${line.name} を削除`}
                    >
                      ✕
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </section>
      </main>

      {/* ★ 固定フッターに隠れないためのスペーサー（見た目は出ません） */}
      <div
        aria-hidden
        className="w-full"
        style={{ height: 'calc(120px + env(safe-area-inset-bottom, 0px))' }}
      />

      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[360px] px-4 pb-4 pt-2" data-testid="footerbar">
        <div className="rounded-[28px] bg-white p-4 shadow-xl shadow-blue-100/40 ring-1 ring-white">
          {/* うち税額（10%）を表示 */}
          <div className="flex items-center justify-between text-xs text-neutral-500">
            <span>うち税額（10%）</span>
            <span>{formatCurrency(totals.tax)}</span>
          </div>

          {/* 合計（税込） */}
          <div className="mt-1 flex items-end justify-between text-xs text-neutral-500">
            <span>合計（税込）</span>
            <span className="text-2xl font-semibold text-neutral-900">
              {formatCurrency(totals.taxIn)}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setCheckoutOpen(true)}
            className="mt-3 w-full rounded-2xl bg-[#5d7bff] py-3 text-base font-semibold text-white shadow-lg shadow-blue-200/50 transition hover:bg-[#4d6bf7] disabled:cursor-not-allowed disabled:opacity-40"
            disabled={cart.length === 0}
          >
            購入
          </button>
        </div>
      </div>

      {/* カメラ・スキャナ */}
      <BarcodeScanner
        open={isScannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={(code) => void handleScanDetected(code)}
      />

      {/* ✅ スキャン成功モーダル（数量±） */}
      <AddToCartSuccessModal
        open={isSuccessOpen}
        item={successItem}
        initialQty={successQty}
        onChangeQty={(q) => setSuccessQty(clampQuantity(q))}
        onContinueScan={(q) => {
          if (successItem) addOrIncrementProduct(successItem, clampQuantity(q), { updateManualFields: false, focusQuantityOnInsert: false });
          setSuccessOpen(false);
          setSuccessItem(null);
          setSuccessQty(1);
          setScannerOpen(true); // 続けてスキャン
        }}
        onFinishScan={(q) => {
          if (successItem) addOrIncrementProduct(successItem, clampQuantity(q), { updateManualFields: false, focusQuantityOnInsert: false });
          setSuccessOpen(false);
          setSuccessItem(null);
          setSuccessQty(1);
        }}
        onClose={() => {
          setSuccessOpen(false);
          setSuccessItem(null);
        }}
        minQty={MIN_QUANTITY}
        maxQty={MAX_QUANTITY}
      />

      {/* 会計モーダル */}
      {isCheckoutOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl ring-1 ring-neutral-200">
            <h2 className="text-base font-semibold text-neutral-900">お会計内容の確認</h2>
            <div className="mt-4 max-h-64 space-y-3 overflow-y-auto pr-1">
              {cart.map((line) => (
                <div key={`checkout-${line.code}`} className="rounded-2xl bg-neutral-50 p-4 ring-1 ring-neutral-200">
                  <div className="flex items-start justify-between text-xs text-neutral-600">
                    <div>
                      <p className="text-sm font-semibold text-neutral-900">{line.name}</p>
                      <p className="text-[11px] text-neutral-500">{line.code}</p>
                    </div>
                    <span>
                      {line.quantity} 点 × {formatCurrency(line.unitPrice)}
                    </span>
                  </div>
                  <p className="mt-2 text-right text-sm font-semibold text-blue-600">
                    {formatCurrency(line.unitPrice * line.quantity)}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-6 space-y-2 text-sm text-neutral-600">
              <div className="flex items-center justify-between">
                <span>小計（税抜）</span>
                <span>{formatCurrency(totals.taxOut)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>消費税（10%）</span>
                <span>{formatCurrency(totals.tax)}</span>
              </div>
              <div className="flex items-center justify-between text-base font-semibold text-neutral-900">
                <span>合計（税込）</span>
                <span>{formatCurrency(totals.taxIn)}</span>
              </div>
            </div>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => setCheckoutOpen(false)}
                className="min-h-[48px] flex-1 rounded-2xl border border-neutral-300 bg-white text-sm font-semibold text-neutral-600 hover:bg-neutral-100"
              >
                戻る
              </button>

              {/* ✅ [Stripe] 追加ボタン：Stripeで支払う（Checkout） */}
              <button
                type="button"
                onClick={() => void handleStripeCheckout()}
                disabled={isConfirming || cart.length === 0}
                className="min-h-[48px] flex-1 rounded-2xl border border-neutral-300 bg-white text-sm font-semibold hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Stripeで支払う（TEST）
              </button>

              <button
                type="button"
                onClick={() => void handleConfirmCheckout()}
                disabled={isConfirming}
                className="min-h-[48px] flex-1 rounded-2xl bg-blue-600 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isConfirming ? '登録中…' : '会計を確定'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
