// src/components/BarcodeScanner.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType, NotFoundException } from '@zxing/library';
import { getValidEAN13 } from '../lib/validators';

type Props = {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
  /** 検出後に自動で閉じるか（既定: false） */
  autoCloseOnDetect?: boolean;
};

type ScannerStatus = 'initializing' | 'scanning' | 'detected' | 'error';

const DEBUG = Boolean(process.env.NEXT_PUBLIC_DEBUG_SCAN);

export default function BarcodeScanner({
  open,
  onClose,
  onDetected,
  autoCloseOnDetect = false,
}: Props) {
  // ✅ フックは常に先頭で宣言
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [status, setStatus] = useState<ScannerStatus>('initializing');
  const [error, setError] = useState('');

  useEffect(() => {
    let stopped = false;

    if (!open) {
      return () => {
        /* nothing */
      };
    }

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
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        const video = videoRef.current;
        if (!video) throw new Error('カメラ要素が見つかりません');

        video.srcObject = stream;
        video.playsInline = true;
        video.muted = true;
        await video.play();

        const hints = new Map<DecodeHintType, unknown>();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.CODE_128,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);

        const reader = new BrowserMultiFormatReader(hints);
        setStatus('scanning');

        const controls = await reader.decodeFromVideoDevice(
          undefined,
          video,
          (result, err, ctl) => {
            if (stopped) return;

            if (result) {
              const raw = result.getText();
              const canonical = getValidEAN13(raw);
              if (DEBUG) console.log('[ZXing] raw:', raw, 'canonical:', canonical);

              if (canonical) {
                setStatus('detected');
                stopped = true;

                // スキャン停止（ここでカメラも止める）
                try {
                  ctl?.stop();
                } catch {}
                try {
                  streamRef.current?.getTracks().forEach((t) => t.stop());
                } catch {}

                // 親へ通知（親でモーダルを出す）
                onDetected(canonical);

                // 自動で閉じたい場合だけ閉じる（既定は閉じない）
                if (autoCloseOnDetect) {
                  onClose();
                }
              }
              return;
            }

            // NotFound は無視。他のエラーのみ表示
            if (err && !(err instanceof NotFoundException)) {
              if (DEBUG) console.warn('[ZXing] error:', err);
              setStatus('error');
              setError((err as Error).message ?? 'スキャンに失敗しました');
            }
          }
        );

        controlsRef.current = controls;
      } catch (e: unknown) {
        if (DEBUG) console.warn('Camera start failed:', e);
        setStatus('error');
        setError(e instanceof Error ? e.message : 'カメラを起動できませんでした');
      }
    })();

    return () => {
      stopped = true;
      try {
        controlsRef.current?.stop();
      } catch {}
      try {
        streamRef.current?.getTracks().forEach((t) => t.stop());
      } catch {}
      controlsRef.current = null;
      streamRef.current = null;
    };
  }, [open, onClose, onDetected, autoCloseOnDetect]);

  // モーダル閉時は何も描画しない（フックは既に評価済み）
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
          <video
            ref={videoRef}
            className="h-[280px] w-full object-cover"
            playsInline
            muted
            autoPlay
          />
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
            <li>バーコードを赤い枠に合わせる（横にまっすぐ）</li>
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
