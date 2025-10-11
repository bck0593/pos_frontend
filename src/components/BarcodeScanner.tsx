'use client';

import { useEffect, useRef, useState } from 'react';
import {
  BrowserMultiFormatReader,
  DecodeHintType,
  BarcodeFormat,
  IScannerControls,
} from '@zxing/browser';
import { NotFoundException, ChecksumException, FormatException } from '@zxing/library';

type Props = {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
};

const DETECTED_COOLDOWN_MS = 700;

/** EAN-13 チェックデジット検証 */
function isValidEAN13(text: string) {
  if (!/^\d{13}$/.test(text)) return false;
  const digits = text.split('').map(Number);
  const check = digits.pop()!;
  const sum = digits.reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/** UPC-A(12桁) を EAN-13 に正規化（先頭0付与）。その他は13桁の数字以外を除外 */
function normalizeToEAN13(text: string) {
  const digits = text.replace(/\D/g, '');
  if (/^\d{13}$/.test(digits)) return digits;
  if (/^\d{12}$/.test(digits)) return '0' + digits; // UPC-A → EAN-13
  return null;
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

    // EAN_13 のみヒント
    const hints = new Map<DecodeHintType, BarcodeFormat[]>();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13]);
    const reader = new BrowserMultiFormatReader(hints);

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

        // iOS安定用：解像度・フレームレートを明示
        const constraints: MediaStreamConstraints = {
          video: back
            ? {
                deviceId: { exact: back.deviceId },
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30, min: 10 },
              }
            : {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30, min: 10 },
              },
          audio: false,
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;

        const video = videoRef.current;
        if (!video) return;

        video.srcObject = stream;

        // iOS Safari は属性も明示しておくと安定する
        video.setAttribute('playsinline', '');
        video.setAttribute('muted', '');
        video.setAttribute('autoplay', '');

        await video.play().catch(() => {});

        // 端末が特定できていれば deviceId を decode にも渡す（iOSの背面固定）
        controlsRef.current = await reader.decodeFromVideoDevice(
          back?.deviceId ?? undefined,
          video,
          (result, err) => {
            if (cancelled) return;

            if (result) {
              const now = Date.now();
              if (now - lastDetectedRef.current < DETECTED_COOLDOWN_MS) return;

              const maybe = normalizeToEAN13(result.getText());
              if (!maybe || !isValidEAN13(maybe)) return;

              lastDetectedRef.current = now;
              onDetected(maybe);
              return;
            }

            if (err) {
              // 未検出系は無視して継続
              if (
                err instanceof NotFoundException ||
                err instanceof ChecksumException ||
                err instanceof FormatException
              ) {
                return;
              }
            }
          }
        );
      } catch (e: any) {
        setErrorMsg(
          e?.name === 'NotAllowedError'
            ? 'カメラ使用が許可されていません。ブラウザの設定で許可してください。'
            : 'カメラを開始できませんでした。HTTPSでのアクセスやデバイスのカメラ権限を確認してください。'
        );
      }
    }

    start();

    // 画面が非表示→再表示のときに再アタッチ（iOS対策）
    const handleVisibility = async () => {
      if (document.hidden) {
        controlsRef.current?.stop();
        controlsRef.current = null;
      } else if (!controlsRef.current && videoRef.current?.srcObject) {
        const back = await pickBackCamera().catch(() => null);
        reader
          .decodeFromVideoDevice(
            back?.deviceId ?? undefined,
            videoRef.current!,
            (result, err) => {
              if (cancelled) return;

              if (result) {
                const now = Date.now();
                if (now - lastDetectedRef.current < DETECTED_COOLDOWN_MS) return;

                const maybe = normalizeToEAN13(result.getText());
                if (!maybe || !isValidEAN13(maybe)) return;

                lastDetectedRef.current = now;
                onDetected(maybe);
                return;
              }

              if (
                err &&
                !(err instanceof NotFoundException) &&
                !(err instanceof ChecksumException) &&
                !(err instanceof FormatException)
              ) {
                // 重大系のみログ
                // console.debug('[ZXing] error', err);
              }
            }
          )
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
      const s = streamRef.current;
      if (s) {
        s.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
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
          <button
            className="rounded-lg bg-white px-4 py-2 text-black"
            onClick={onClose}
            aria-label="閉じる"
          >
            閉じる
          </button>
          {/* エラー時のガイダンス */}
          {errorMsg && <p className="text-sm text-red-300">{errorMsg}</p>}
        </div>
      </div>
    </div>
  );
}
