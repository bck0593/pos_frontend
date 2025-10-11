'use client';

import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import {
  DecodeHintType,
  BarcodeFormat,
  NotFoundException,
  ChecksumException,
  FormatException,
} from '@zxing/library';

type Props = {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
};

const DETECTED_COOLDOWN_MS = 700;

function isValidEAN13(text: string) {
  if (!/^\d{13}$/.test(text)) return false;
  const digits = text.split('').map(Number);
  const check = digits.pop()!;
  const sum = digits.reduce((acc, digit, index) => acc + digit * (index % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10 === check;
}

export default function BarcodeScanner({ open, onClose, onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastDetectedRef = useRef<number>(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    // ← ここがポイント：hints は @zxing/library の DecodeHintType/BarcodeFormat を使う
    const hints = new Map<DecodeHintType, unknown>();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13]);
    // BrowserMultiFormatReader の引数に hints（と任意のクールダウンms）
    const reader = new BrowserMultiFormatReader(hints, DETECTED_COOLDOWN_MS);

    async function pickBackCamera(): Promise<MediaDeviceInfo | null> {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videos = devices.filter((d) => d.kind === 'videoinput');
        const back = videos.find((d) => /back|rear|environment/i.test(d.label));
        return back ?? videos[0] ?? null;
      } catch {
        return null;
      }
    }

    async function start() {
      setErrorMsg(null);
      try {
        const back = await pickBackCamera();

        const constraints: MediaStreamConstraints = {
          video: back
            ? {
                deviceId: { exact: back.deviceId },
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: 'environment' as const,
              }
            : { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;

        const video = videoRef.current;
        if (!video) return;

        video.setAttribute('playsinline', 'true'); // iOS 対策
        video.srcObject = stream;
        await video.play();

        controlsRef.current = await reader.decodeFromVideoDevice(undefined, video, (result, err) => {
          if (cancelled) return;

          if (result) {
            const now = Date.now();
            if (now - lastDetectedRef.current < DETECTED_COOLDOWN_MS) return;
            const raw = result.getText().replace(/\D/g, '');
            if (!isValidEAN13(raw)) return;
            lastDetectedRef.current = now;
            onDetected(raw);
            return;
          }

          if (
            err instanceof NotFoundException ||
            err instanceof ChecksumException ||
            err instanceof FormatException
          ) {
            // これらは毎フレーム起こり得るので握りつぶす
            return;
          }
        });
      } catch (error: unknown) {
        if (error && typeof error === 'object' && 'name' in error && (error as any).name === 'NotAllowedError') {
          setErrorMsg('カメラ使用が許可されていません。ブラウザの設定で許可してください。');
        } else {
          setErrorMsg('カメラを開始できませんでした。HTTPSやカメラ権限を確認してください。');
        }
      }
    }

    start();

    const handleVisibility = () => {
      if (document.hidden) {
        controlsRef.current?.stop();
        controlsRef.current = null;
      } else if (!controlsRef.current && videoRef.current?.srcObject) {
        reader
          .decodeFromVideoDevice(undefined, videoRef.current, (result, err) => {
            if (cancelled) return;

            if (result) {
              const now = Date.now();
              if (now - lastDetectedRef.current < DETECTED_COOLDOWN_MS) return;
              const raw = result.getText().replace(/\D/g, '');
              if (!isValidEAN13(raw)) return;
              lastDetectedRef.current = now;
              onDetected(raw);
              return;
            }

            if (
              err instanceof NotFoundException ||
              err instanceof ChecksumException ||
              err instanceof FormatException
            ) {
              return;
            }
          })
          .then((controls) => {
            if (!cancelled) {
              controlsRef.current = controls;
            } else {
              controls.stop();
            }
          })
          .catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibility);
      controlsRef.current?.stop();
      controlsRef.current = null;
      const stream = streamRef.current;
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      const video = videoRef.current;
      if (video) {
        video.srcObject = null;
      }
    };
  }, [open, onDetected]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80">
      <div className="w-[92%] max-w-md">
        <video
          ref={videoRef}
          className="w-full rounded-xl border-2 border-white/70"
          playsInline
          muted
          autoPlay
        />
        <div className="mt-3 flex items-center justify-between">
          <button className="rounded-lg bg-white px-4 py-2 text-black" onClick={onClose} aria-label="閉じる">
            閉じる
          </button>
          {/* エラーメッセージ */}
          {/* iOS の場合は「ホーム画面に追加」や「HTTPS必須」も有効な注意点 */}
          {/* 任意で表示 */}
        </div>
      </div>
    </div>
  );
}
