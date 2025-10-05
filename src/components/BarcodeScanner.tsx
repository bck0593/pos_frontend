'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType, NotFoundException } from '@zxing/library';

type Props = {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
};

type ScannerStatus = 'initializing' | 'scanning' | 'detected' | 'error';

const ROI_WIDTH_RATIO = 0.7;
const ROI_HEIGHT_RATIO = 0.4;
const DEBUG = Boolean(process.env.NEXT_PUBLIC_DEBUG_SCAN);

function debugLog(...args: unknown[]) {
  if (DEBUG) console.log(...args);
}

function isValidEAN13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  const digits = code.split('').map(Number);
  const checkDigit = digits.pop()!;
  const sum = digits.reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10 === checkDigit;
}

export default function BarcodeScanner({ open, onClose, onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [status, setStatus] = useState<ScannerStatus>('initializing');
  const [error, setError] = useState('');

  // ROI の計算関数（video の実寸から算出）
  const getScanRegion = useMemo(() => {
    return (vw: number, vh: number) => {
      const width = Math.floor(vw * ROI_WIDTH_RATIO);
      const height = Math.floor(vh * ROI_HEIGHT_RATIO);
      const x = Math.floor((vw - width) / 2);
      const y = Math.floor((vh - height) / 2);
      return { x, y, width, height };
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    let stopped = false;

    (async () => {
      try {
        setStatus('initializing');
        setError('');

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        streamRef.current = stream;

        const video = videoRef.current;
        if (!video) throw new Error('カメラ要素が見つかりません');

        video.srcObject = stream;
        video.playsInline = true;
        video.muted = true;
        await video.play();

        // ヒント（対応フォーマット、TRY_HARDER など）
        const hints = new Map<DecodeHintType, unknown>();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.CODE_128,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);

        const reader = new BrowserMultiFormatReader(hints);
        readerRef.current = reader;

        setStatus('scanning');

        // 型差分に影響されないように any でラップ
        const callback: any = (result: any, err: any, controls: IScannerControls) => {
          if (stopped) return;

          // 毎フレーム ROI を更新（video 実寸から計算）
          try {
            const vw = video.videoWidth || 0;
            const vh = video.videoHeight || 0;
            if (vw && vh && controls?.setScanRegion) {
              const region = getScanRegion(vw, vh);
              controls.setScanRegion(region);
              if (DEBUG && (performance.now() % 1000) < 30) {
                debugLog('[scan] tick', { vw, vh, region });
              }
            }
          } catch {
            /* ROI 設定に失敗しても続行 */
          }

          if (result) {
            const raw = String(result.getText?.() ?? result.text ?? '');
            const normalized = raw.replace(/\D/g, '');
            debugLog('✅ detected:', raw, '->', normalized);
            if (isValidEAN13(normalized)) {
              setStatus('detected');
              onDetected(normalized);
              onClose();
              stopped = true;
              try { controls?.stop?.(); } catch {}
              try { streamRef.current?.getTracks().forEach(t => t.stop()); } catch {}
            }
            return;
          }

          if (err && !(err instanceof NotFoundException)) {
            debugLog('ZXing error:', err);
            setStatus('error');
            setError(err?.message ?? 'スキャンに失敗しました');
          }
        };

        // ここも型差分を回避
        controlsRef.current = await (reader.decodeFromVideoDevice as any)(
          undefined, // 既定カメラ
          video,
          callback
        );
      } catch (e) {
        debugLog('Camera start failed:', e);
        setStatus('error');
        setError(e instanceof Error ? e.message : 'カメラを起動できませんでした');
      }
    })();

    return () => {
      stopped = true;
      try { controlsRef.current?.stop?.(); } catch {}
      try { (readerRef.current as any)?.reset?.(); } catch {}
      try { streamRef.current?.getTracks().forEach(t => t.stop()); } catch {}
      controlsRef.current = null;
      readerRef.current = null;
      streamRef.current = null;
    };
  }, [open, onClose, onDetected, getScanRegion]);

  if (!open) return null;

  const statusLabel =
    status === 'initializing'
      ? 'カメラを準備しています…'
      : status === 'detected'
      ? '検出しました'
      : status === 'error'
      ? error || 'スキャンに失敗しました'
      : 'スキャン中…';

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute inset-x-4 top-10 mx-auto w-full max-w-sm rounded-3xl bg-white p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-800">カメラで追加</h2>
          <span className="rounded-xl bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-700">
            {statusLabel}
          </span>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-black">
          <video ref={videoRef} className="h-[280px] w-full object-cover" playsInline muted autoPlay />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div
              className="rounded-2xl border-4 border-red-500/80 bg-red-500/5"
              style={{ width: '70%', height: '40%' }}
            />
          </div>
        </div>

        <div className="mt-3 rounded-2xl bg-amber-50 p-3 text-xs text-amber-800">
          <p className="font-semibold">📷 スキャンのコツ</p>
          <ul className="mt-1 list-disc pl-5">
            <li>バーコードを赤い枠に合わせる（横向きで中央に）</li>
            <li>15〜25cm の距離を保つ</li>
            <li>明るい場所で手ブレを抑える</li>
          </ul>
        </div>

        <button
          className="mt-4 w-full rounded-2xl bg-gray-200 py-3 text-sm font-semibold text-gray-700"
          onClick={onClose}
        >
          閉じる
        </button>
      </div>
    </div>
  );
}
