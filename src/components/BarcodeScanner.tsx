'use client';
import React, { useEffect, useRef, useState } from 'react';
import {
  BrowserMultiFormatReader,
  IScannerControls,
} from '@zxing/browser';
import {
  DecodeHintType,
  BarcodeFormat,
} from '@zxing/library';

type Props = {
  onDetected: (code: string) => void;
  timeoutMs?: number; // デフォ10秒でスキャン1回を諦める
};

const DETECT_COOLDOWN_MS = 700;

export default function BarcodeScanner({ onDetected, timeoutMs = 10_000 }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let stream: MediaStream | null = null;

    async function start() {
      if (!videoRef.current) return;
      setError(null);
      setBusy(true);

      // 1) まず軽くgetUserMediaを叩いて、iOSでenumerateDevicesが空になるのを回避
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        stream.getTracks().forEach(t => t.stop());
      } catch (e) {
        // ここで失敗しても後続のdecodeOnceで再度トライするので握り潰す
      }

      // 2) ヒント：EAN系に限定
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8]);

      const reader = new BrowserMultiFormatReader(hints, {
        delayBetweenScanAttempts: DETECT_COOLDOWN_MS,
      });

      // 3) できれば背面カメラのdeviceIdを選ぶ
      async function pickBackCamera(): Promise<string | undefined> {
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videos = devices.filter(d => d.kind === 'videoinput');
          // labelにback/後面/環境などが含まれるもの優先
          const back = videos.find(d => /back|rear|environment|後面|背面/i.test(d.label));
          return (back ?? videos[0])?.deviceId;
        } catch {
          return undefined;
        }
      }

      // 4) iOS対応：まずfacingMode指定→失敗ならdeviceId
      async function startDecode() {
        const vid = videoRef.current!;
        // video属性：iOSの自動再生抑止対策
        vid.setAttribute('playsinline', 'true');
        vid.muted = true;

        const deviceId = await pickBackCamera();

        try {
          // facingModeでまず挑戦（iOS 16+ で安定）
          const res = await reader.decodeOnceFromConstraints(
            {
              audio: false,
              video: {
                facingMode: { exact: 'environment' },
              },
            },
            vid,
          );
          return res;
        } catch {
          // 次にdeviceIdで再トライ
          try {
            const res = await reader.decodeOnceFromVideoDevice(deviceId, vid);
            return res;
          } catch (e2) {
            throw e2;
          }
        }
      }

      // 5) タイムアウト
      const deadline = new Promise<never>((_, rej) => {
        timeoutId = setTimeout(() => rej(new Error('timeout')), timeoutMs);
      });

      try {
        const result = await Promise.race([startDecode(), deadline]);
        if (!cancelled && result) {
          // 軽いフィードバック
          if (navigator.vibrate) navigator.vibrate(50);
          onDetected((result as any).getText?.() ?? (result as any).text ?? '');
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? String(e));
        }
      } finally {
        controlsRef.current = reader as unknown as IScannerControls;
        setBusy(false);
      }
    }

    start();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      // ZXingのstop
      try { controlsRef.current?.stop(); } catch {}
      // videoのストリーム停止
      if (videoRef.current?.srcObject instanceof MediaStream) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
        videoRef.current.srcObject = null;
      }
    };
  }, [onDetected, timeoutMs]);

  return (
    <div className="flex flex-col gap-2">
      <video
        ref={videoRef}
        className="w-full aspect-[3/4] bg-black rounded-md"
        autoPlay
        playsInline
        muted
      />
      {busy && <p className="text-sm text-gray-500">カメラ起動中…</p>}
      {error && <p className="text-sm text-red-600">スキャン失敗: {error}</p>}
    </div>
  );
}
