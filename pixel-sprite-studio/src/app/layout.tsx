import type { Metadata } from 'next';
import './globals.css';
import './studio.css';
export const metadata: Metadata = { title: 'Pixel Studio — 작은 픽셀, 큰 상상', description: '16·32·48·64·128px 게임 스프라이트를 생성하는 로컬 픽셀 스튜디오' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="ko" className="dark"><body>{children}</body></html>;
}
