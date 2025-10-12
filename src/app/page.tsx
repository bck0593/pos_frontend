import NextDynamic from 'next/dynamic';

// Next のルート設定（これは文字列エクスポート）
export const dynamic = 'force-dynamic';

const POSClient = NextDynamic(() => import('./POSClient'), {
  ssr: false,
  loading: () => (
    <main className="mx-auto flex min-h-screen w-full max-w-[360px] items-center justify-center bg-[#f4f6fb] px-4">
      <div className="rounded-2xl bg-white px-4 py-3 text-sm text-neutral-600 shadow ring-1 ring-neutral-200">
        画面を読み込んでいます…
      </div>
    </main>
  ),
});

export default function Page() {
  return <POSClient />;
}
