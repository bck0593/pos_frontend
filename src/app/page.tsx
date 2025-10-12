// app/page.tsx
import dynamic from 'next/dynamic';

const POSClient = dynamic(() => import('./POSClient'), {
  ssr: false,
  loading: () => <div className="p-6">読み込み中...</div>,
});

export default function Page() {
  return <POSClient />;
}
