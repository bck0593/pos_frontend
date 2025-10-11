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

const DETECTED_COOLDOWN_MS = 700; // 連続検出の過剰トリガー抑制

function isValidEAN13(text: string) {
  if (!/^\d{13}$/.test(text)) return false;
  const digits = text.split('').map(Number);
  const check = digits.pop()!;
  const sum = digits.reduce((acc, digit, idx) => acc + digit * (idx % 2 === 0 ? 1 : 3), 0);
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

    // ZXing のヒント設定（EAN-13 のみ）
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13]);

    // ★ ここが今回の修正点：第2引数は数値ではなくオプションオブジェクト
    const reader = new BrowserMultiFormatReader(hints, {
      delayBetweenScanAttempts: DETECTED_COOLDOWN_MS,
      delayBetweenScanSuccess: DETECTED_COOLDOWN_MS,
    });

    async function pickBackCamera(): Promise<MediaDeviceInfo | null> {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videos = devices.filter((d) => d.kind === 'videoinput');
        // ラベルに "back/rear/environment" を含むものを優先（iOS Safari は https + 許可後でないと label が出ないことあり）
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

        // iOS Safari 向けに environment を理想指定、取れるなら deviceId を使う
        const constraints: MediaStreamConstraints = {
          video: back
            ? { deviceId: { exact: back.deviceId } }
            : {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1280 },
                height: { ideal: 720 },
              },
          audio: false,
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;

        const video = videoRef.current;
        if (!video) return;

        video.srcObject = stream;
        // iOS Safari でインライン再生を有効化
        video.setAttribute('playsinline', 'true');
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
            err &&
            (err instanceof NotFoundException ||
              err instanceof ChecksumException ||
              err instanceof FormatException)
          ) {
            // 未検出・チェックサム不一致・形式不正は黙って再試行
            return;
          }
        });
      } catch (error: any) {
        if (error?.name === 'NotAllowedError') {
          setErrorMsg('カメラ使用が許可されていません。ブラウザの設定で許可してください。');
        } else if (window.isSecureContext === false) {
          setErrorMsg('HTTPS でのアクセスが必要です。https でページを開いてください。');
        } else {
          setErrorMsg('カメラを開始できませんでした。デバイスのカメラ権限や https を確認してください。');
        }
      }
    }

    start();

    // タブが非表示になったら一時停止、復帰で再開
    const handleVisibility = () => {
      if (document.hidden) {
        controlsRef.current?.stop();
        controlsRef.current = null;
      } else if (!controlsRef.current && videoRef.current?.srcObject) {
        reader
          .decodeFromVideoDevice(undefined, videoRef.current!, (result, err) => {
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
              err &&
              (err instanceof NotFoundException ||
                err instanceof ChecksumException ||
                err instanceof FormatException)
            ) {
              return;
            }
          })
          .then((controls) => {
            if (!cancelled) controlsRef.current = controls;
            else controls.stop();
          })
          .catch(() => {
            /* noop */
          });
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // クリーンアップ
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibility);
      try {
        controlsRef.current?.stop();
      } catch {
        /* noop */
      } finally {
        controlsRef.current = null;
      }
      const stream = streamRef.current;
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      const v = videoRef.current;
      if (v) v.srcObject = null;
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
          // muted/autoPlay は video.play() 前提で、属性も付けておく（iOS 対策）
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
          {errorMsg && <p className="ml-3 text-sm text-red-300">{errorMsg}</p>}
        </div>
      </div>
    </div>
  );
}
