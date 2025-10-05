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

const ROI_WIDTH_RATIO = 0.7;   // 中央 70%
const ROI_HEIGHT_RATIO = 0.4;  // 中央 40%
const DEBUG = Boolean(process.env.NEXT_PUBLIC_DEBUG_SCAN);

function isValidEAN13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  const d = code.split('').map(Number);
  const check = d.pop()!;
  const sum = d.reduce((acc, v, i) => acc + v * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10 === check;
}

export default function BarcodeScanner({ open, onClose, onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [status, setStatus] = useState<ScannerStatus>('initializing');
  const [error, setError] = useState('');

  // フレームサイズから ROI を計算
  const scanRegion = useMemo(() => {
    return (width: number, height: number) => {
      const rw = Math.floor(width * ROI_WIDTH_RATIO);
      const rh = Math.floor(height * ROI_HEIGHT_RATIO);
      const rx = Math.floor((width - rw) / 2);
      const ry = Math.floor((height - rh) / 2);
      return { x: rx, y: ry, width: rw, height: rh };
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    let stopped = false;

    (async () => {
      try {
        setStatus('initializing');
        setError('');

        // PC内蔵カメラでも通る控えめな制約
        const constraints: MediaStreamConstraints = {
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;

        const video = videoRef.current;
        if (!video) throw new Error('カメラ要素が見つかりません');

        video.srcObject = stream;
        video.playsInline = true;
        video.muted = true;
        await video.play();

        // ZXing セットアップ
        const hints = new Map<DecodeHintType, unknown>();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.CODE_128,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);

        const reader = new BrowserMultiFormatReader(hints);
        setStatus('scanning');

        // 連続スキャン開始
        controlsRef.current = await reader.decodeFromVideoDevice(
          undefined,
          video,
          (result, err, controls, frame) => {
            if (stopped) return;

            // 毎フレーム ROI をセット（古い環境で失敗しても握りつぶす）
            if (frame?.width && frame?.height) {
              const region = scanRegion(frame.width, frame.height);
              try {
                controls.setScanRegion(region);
              } catch {}
              if (DEBUG && (performance.now() % 1000) < 30) {
                console.log('[scan]', frame.width, frame.height, region);
              }
            }

            if (result) {
              const raw = result.getText();
              const normalized = raw.replace(/\D/g, '');
              if (DEBUG) console.log('ZXing raw:', raw, 'normalized:', normalized);
              if (isValidEAN13(normalized)) {
                setStatus('detected');
                onDetected(normalized);
                onClose();
                stopped = true;
                try { controlsRef.current?.stop(); } catch {}
                try { streamRef.current?.getTracks().forEach(t => t.stop()); } catch {}
              }
              return;
            }

            if (err && !(err instanceof NotFoundException)) {
              if (DEBUG) console.warn('ZXing error:', err);
              setStatus('error');
              setError((err as Error)?.message ?? 'スキャンに失敗しました');
            }
          }
        );
      } catch (e: unknown) {
        if (DEBUG) console.warn('Camera start failed:', e);
        setStatus('error');
        setError(e instanceof Error ? e.message : 'カメラを起動できませんでした');
      }
    })();

    return () => {
      // reset() は使わない（環境差で存在しない）
      try { controlsRef.current?.stop(); } catch {}
      try { streamRef.current?.getTracks().forEach(t => t.stop()); } catch {}
      controlsRef.current = null;
      streamRef.current = null;
    };
  }, [open, onClose, onDetected, scanRegion]);

  if (!open) return null;

  const statusLabel =
    status === 'initializing' ? 'カメラを準備しています…' :
    status === 'detected'     ? '検出しました' :
    status === 'error'        ? (error || 'スキャンに失敗しました') :
                                'スキャン中…';

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
          {/* ROI ガイド */}
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
            <li>バーコードを赤い枠に合わせる（横方向に真っ直ぐ）</li>
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
