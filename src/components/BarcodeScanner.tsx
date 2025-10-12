// src/components/BarcodeScanner.tsx
'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';

export type BarcodeScannerProps = {
  /** モーダルを開く/閉じる */
  open: boolean;
  /** モーダルを閉じるハンドラ */
  onClose: () => void;
  /** 検出時のコールバック（JANコード等） */
  onDetected: (code: string) => void;
  /** 1回のスキャン試行のタイムアウト(ms) */
  timeoutMs?: number; // default 10_000
};

const DETECT_COOLDOWN_MS = 700;

export default function BarcodeScanner({
  open,
  onClose,
  onDetected,
  timeoutMs = 10_000,
}: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ZXing ヒント（EAN-13/EAN-8 のみ）
  const hints = useMemo(() => {
    const m = new Map<DecodeHintType, unknown>();
    m.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8]);
    return m;
  }, []);

  const stopAll = useCallback(() => {
    try {
      controlsRef.current?.stop();
    } catch {}
    controlsRef.current = null;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    const v = videoRef.current;
    if (v?.srcObject instanceof MediaStream) {
      (v.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
      v.srcObject = null;
    }
  }, []);

  useEffect(() => {
    if (!open) {
      stopAll();
      setBusy(false);
      setError(null);
      return;
    }

    let cancelled = false;
    (async () => {
      setBusy(true);
      setError(null);

      // 1) iOS 対策: enumerateDevices が空にならないように軽く getUserMedia
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        s.getTracks().forEach((t) => t.stop());
      } catch {
        /* ignore – 後続で再試行 */
      }

      const reader = new BrowserMultiFormatReader(hints, {
        delayBetweenScanAttempts: DETECT_COOLDOWN_MS,
      });

      // 背面カメラを優先して選ぶ
      async function pickBackCameraId(): Promise<string | undefined> {
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videos = devices.filter((d) => d.kind === 'videoinput');
          const back = videos.find((d) => /back|rear|environment|後面|背面/i.test(d.label));
          return (back ?? videos[0])?.deviceId;
        } catch {
          return undefined;
        }
      }

      async function startDecode() {
        const v = videoRef.current!;
        v.setAttribute('playsinline', 'true');
        v.muted = true;

        // まず facingMode で試す（iOS 16+ で安定）
        try {
          const res = await reader.decodeOnceFromConstraints(
            { audio: false, video: { facingMode: { exact: 'environment' } } },
            v,
          );
          return res;
        } catch {
          // ダメなら deviceId 指定で再挑戦
          const deviceId = await pickBackCameraId();
          const res = await reader.decodeOnceFromVideoDevice(deviceId, v);
          return res;
        }
      }

      // タイムアウト
      const timeoutP = new Promise<never>((_, rej) => {
        timeoutRef.current = setTimeout(() => rej(new Error('timeout')), timeoutMs);
      });

      try {
        const result = (await Promise.race([startDecode(), timeoutP])) as any;
        if (!cancelled && result) {
          if (navigator.vibrate) navigator.vibrate(50);
          const text: string =
            typeof result?.getText === 'function' ? result.getText() : result?.text ?? '';
          onDetected(text);
          // 1ヒットで自動クローズしたい場合は下を有効化
          // onClose();
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? String(e));
        }
      } finally {
        if (!cancelled) {
          controlsRef.current = reader as unknown as IScannerControls;
          setBusy(false);
        } else {
          try {
            reader.stop();
          } catch {}
        }
      }
    })();

    return () => {
      cancelled = true;
      stopAll();
    };
  }, [open, hints, onDetected, timeoutMs, stopAll]);

  // Escで閉じる
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-[min(92vw,520px)] rounded-xl bg-white p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">バーコードスキャン</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border px-2 py-1 text-sm hover:bg-gray-50"
          >
            閉じる
          </button>
        </div>

        <video
          ref={videoRef}
          className="aspect-[3/4] w-full rounded-md bg-black"
          autoPlay
          playsInline
          muted
        />

        {busy && <p className="mt-2 text-sm text-gray-500">カメラ起動中…</p>}
        {error && (
          <p className="mt-2 text-sm text-red-600">
            スキャン失敗: {error === 'timeout' ? 'タイムアウトしました。' : error}
          </p>
        )}
        <p className="mt-1 text-xs text-gray-400">
          うまく読めない時はバーコードをカメラの中央に置き、距離を前後に調整してください。
        </p>
      </div>
    </div>
  );
}
