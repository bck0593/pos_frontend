'use client';

import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType, NotFoundException } from '@zxing/library';
import { getValidEAN13 } from '../lib/validators';

type Props = {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
};

type ScannerStatus = 'initializing' | 'scanning' | 'detected' | 'error';

const DEBUG = Boolean(process.env.NEXT_PUBLIC_DEBUG_SCAN);
const DETECTED_COOLDOWN_MS = 600;

export default function BarcodeScanner({ open, onClose, onDetected }: Props): JSX.Element | null {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const isMountedRef = useRef(false);

  const [status, setStatus] = useState<ScannerStatus>('initializing');
  const [error, setError] = useState('');

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const cleanUpStream = () => {
      try {
        streamRef.current?.getTracks().forEach((track) => track.stop());
      } catch {
        /* no-op */
      }
      streamRef.current = null;
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };

    if (!open) {
      cleanUpStream();
      setStatus('initializing');
      setError('');
      return () => {
        /* nothing */
      };
    }

    const start = async () => {
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
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        if (DEBUG) {
          console.log('[BarcodeScanner] getUserMedia stream', stream);
        }

        streamRef.current = stream;

        const video = videoRef.current;
        if (!video) {
          throw new Error('カメラ映像を表示できませんでした。');
        }

        video.srcObject = stream;
        video.playsInline = true;
        video.muted = true;
        await video.play();

        const hints = new Map<DecodeHintType, unknown>();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13]);
        hints.set(DecodeHintType.TRY_HARDER, true);

        const reader = new BrowserMultiFormatReader(hints);
        setStatus('scanning');

        controlsRef.current = await reader.decodeFromVideoDevice(
          undefined,
          video,
          (result, err) => {
            if (cancelled || !isMountedRef.current) return;
            if (result) {
              const validCode = getValidEAN13(result.getText());
              if (!validCode) {
                return;
              }
              setStatus('detected');
              onDetected(validCode);
              window.setTimeout(() => {
                if (!cancelled) {
                  setStatus('scanning');
                }
              }, DETECTED_COOLDOWN_MS);
              return;
            }

            if (err instanceof NotFoundException) {
              if (status !== 'scanning') {
                setStatus('scanning');
              }
              return;
            }

            if (err) {
              if (DEBUG) {
                console.warn('[BarcodeScanner] decode error', err);
              }
              setStatus('error');
              setError(
                err instanceof Error
                  ? err.message
                  : 'スキャン中にエラーが発生しました。手入力をご利用ください。',
              );
            }
          },
        );
      } catch (err) {
        if (DEBUG) {
          console.warn('[BarcodeScanner] camera start failed', err);
        }
        if (!cancelled) {
          setStatus('error');
          setError(
            err instanceof Error
              ? err.message
              : 'カメラの起動に失敗しました。手入力でバーコードを入力してください。',
          );
        }
      }
    };

    start().catch((err) => {
      if (DEBUG) {
        console.warn('[BarcodeScanner] start sequence failed', err);
      }
    });

    return () => {
      cancelled = true;
      try {
        controlsRef.current?.stop();
      } catch {
        /* no-op */
      } finally {
        controlsRef.current = null;
      }
      cleanUpStream();
    };
  }, [open, onDetected]);

  if (!open) return null;

  const statusLabel =
    status === 'initializing'
      ? 'カメラを起動しています…'
      : status === 'detected'
        ? '読み取りました'
        : status === 'error'
          ? error || 'スキャン中にエラーが発生しました'
          : '読み取り中…';

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute inset-x-4 top-10 mx-auto w-full max-w-sm rounded-3xl bg-white p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-800">カメラから追加</h2>
          <span className="rounded-xl bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-700">
            {statusLabel}
          </span>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-blue-200 bg-black">
          <video ref={videoRef} className="h-[280px] w-full object-cover" playsInline muted autoPlay />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div
              className="rounded-2xl border-[5px] border-blue-500/90 bg-blue-400/15 shadow-[0_0_32px_rgba(59,130,246,0.45)]"
              style={{ width: '70%', height: '40%' }}
            />
          </div>
        </div>

        <div className="mt-3 rounded-2xl bg-amber-50 p-3 text-xs text-amber-800">
          <p className="font-semibold">📌 スキャンのコツ</p>
          <ul className="mt-1 list-disc pl-5">
            <li>バーコードはまっすぐにあててください</li>
            <li>15〜25cm の距離がベストです</li>
            <li>明るい場所でご利用ください</li>
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
