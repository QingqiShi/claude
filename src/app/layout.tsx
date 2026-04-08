import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Dashboard App',
  description: 'Internal dashboard application',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
