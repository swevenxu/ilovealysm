import type { Metadata } from 'next';
import { Khand } from 'next/font/google';
import './globals.css';
import './ui-fixes.css';
import Sidebar from '@/components/Sidebar';
import { ErrorBoundary } from '@/components/ErrorBoundary';

const khand = Khand({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-khand',
});

export const metadata: Metadata = {
  title: 'XuLovesAly <3',
  description:
    'Upload, verify, organize, and study from your PDFs and documents. Practice hardcoded quizzes, track progress, and master your subjects with AI-powered study tools.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={khand.variable}>
      <body>
        <ErrorBoundary>
          <div className="app-layout">
            <Sidebar />
            <main className="main-content">{children}</main>
          </div>
        </ErrorBoundary>
      </body>
    </html>
  );
}
