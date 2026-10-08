import type { Metadata, Viewport } from 'next';
import '@fork/ui/fork.css';
import './app.css';

export const metadata: Metadata = {
  title: 'Fork',
  description: 'Better decisions about your pay, pension and benefits.',
  robots: { index: false },
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f5f2' },
    { media: '(prefers-color-scheme: dark)', color: '#111315' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" />
      </head>
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <header className="app-bar">
          <div className="app-bar-in">
            <span className="brand">
              <strong>Fork</strong> <span className="co">Larkfield</span>
            </span>
            <span className="who">Ella Brooks</span>
          </div>
        </header>
        <main id="main" className="app-main">
          {children}
        </main>
      </body>
    </html>
  );
}
