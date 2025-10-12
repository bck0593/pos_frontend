'use client';

import { useEffect, useRef, useState } from 'react';
import { BarcodeFormat, BrowserMultiFormatReader, DecodeHintType, IScannerControls } from '@zxing/browser';
import { ChecksumException, FormatException, NotFoundException } from '@zxing/library';

type Props = {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
};

const DETECTED_COOLDOWN_MS = 700;

function isValidEAN13(value: string): boolean {
  if (!/^\d{13}$/.test(value)) return false;
  const digits = value.split('').map(Number);
  const checkDigit = digits.pop()!;
  const weighted = digits.reduce((sum, digit, index) => sum + digit * (index % 2 === 0 ? 1 : 3), 0);
  return (10 - (weighted % 10)) % 10 === checkDigit;
}

export default function BarcodeScanner({ open, onClose, onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastDetectedRef = useRef<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return () => {
        /* noop */
      };
    }

    let cancelled = false;
    let starting = false;

    const hints = new Map<DecodeHintType, BarcodeFormat[]>();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13]);
    const reader = new BrowserMultiFormatReader(hints);

    async function pickBackCamera(): Promise<MediaDeviceInfo | null> {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videos = devices.filter((device) => device.kind === 'videoinput');
        const back = videos.find((device) => /back|rear|environment/i.test(device.label));
        return back ?? videos[0] ?? null;
      } catch {
        return null;
      }
    }

    async function startScanning(): Promise<void> {
      if (starting || cancelled) return;
      const video = videoRef.current;
      if (!video) return;

      starting = true;
      setErrorMessage(null);

      try {
        // Prime camera permissions so device labels are populated (required on iOS).
        if (!streamRef.current) {
          try {
            const permissionProbe = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            permissionProbe.getTracks().forEach((track) => track.stop());
          } catch {
            /* ignore; actual call below will surface the error */
          }
        }

        const backCamera = await pickBackCamera();
        const constraints: MediaStreamConstraints = {
          video: backCamera
            ? { deviceId: { exact: backCamera.deviceId } }
            : { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        };

        const stream = streamRef.current ?? (await navigator.mediaDevices.getUserMedia(constraints));
        streamRef.current = stream;

        video.srcObject = stream;
        await video.play();

        controlsRef.current = await reader.decodeFromVideoDevice(undefined, video, (result, error) => {
          if (cancelled) return;

          if (result) {
            const now = Date.now();
            if (now - lastDetectedRef.current < DETECTED_COOLDOWN_MS) return;

            const digitsOnly = result.getText().replace(/\D/g, '');
            if (!isValidEAN13(digitsOnly)) return;

            lastDetectedRef.current = now;
            onDetected(digitsOnly);
            return;
          }

          if (
            error &&
            !(error instanceof NotFoundException) &&
            !(error instanceof ChecksumException) &&
            !(error instanceof FormatException)
          ) {
            // Unexpected ZXing error - surface for debugging purposes only.
            console.debug('[BarcodeScanner] decode error', error);
          }
        });
      } catch (error) {
        const message =
          error && typeof error === 'object' && 'name' in error && error.name === 'NotAllowedError'
            ? 'カメラ使用が許可されていません。ブラウザの設定を確認してください。'
            : 'カメラの起動に失敗しました。HTTPSアクセスとカメラ権限を確認してください。';
        setErrorMessage(message);
      } finally {
        starting = false;
      }
    }

    void startScanning();

    const handleVisibility = () => {
      if (document.hidden) {
        controlsRef.current?.stop();
        controlsRef.current = null;
        reader.reset();
      } else if (!controlsRef.current) {
        void startScanning();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibility);
      controlsRef.current?.stop();
      controlsRef.current = null;
      reader.reset();
      const stream = streamRef.current;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      const video = videoRef.current;
      if (video) {
        video.srcObject = null;
      }
    };
  }, [open, onDetected]);

  useEffect(() => {
    if (!open) return;

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="w-[92%] max-w-md rounded-2xl bg-white p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-neutral-900">バーコードスキャン</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-neutral-300 px-3 py-1 text-sm text-neutral-600 hover:bg-neutral-100"
          >
            閉じる
          </button>
        </div>

        <video
          ref={videoRef}
          className="aspect-[3/4] w-full rounded-xl bg-black"
          autoPlay
          playsInline
          muted
        />

        {errorMessage && <p className="mt-3 text-sm text-red-600">{errorMessage}</p>}
        {!errorMessage && (
          <p className="mt-3 text-xs text-neutral-500">
            読み取りに時間がかかる場合はバーコードを中央に合わせ、距離や角度を調整してください。
          </p>
        )}
      </div>
    </div>
  );
}
