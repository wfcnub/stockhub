import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import { QueryProvider } from '@/components/providers/QueryProvider';

export const metadata: Metadata = {
  title: 'StockHub - Stock Analysis Platform',
  description: 'Stock price analysis and screening for Jakarta Composite Index',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased bg-gemini-bg-primary text-gemini-text-primary min-h-screen">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="stockhub-theme">
          <QueryProvider>{children}</QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
