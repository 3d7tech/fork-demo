import type { Metadata, Viewport } from 'next';
import '@fork/ui/fork.css';
import './app.css';
import { getViewer } from '@/lib/viewer';

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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
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
              <strong>Fork</strong> {viewer && <span className="co">{viewer.companyName}</span>}
            </span>
            {viewer?.mode === 'db' ? (
              <nav aria-label="Account">
                {viewer.role === 'employee' && <span className="who">{viewer.personName}</span>}
                {viewer.role === 'owner' && <a href="/setup">Setup</a>}
                {viewer.canSwitch && <a href="/switch">Switch</a>}
                <form action="/signout" method="post">
                  <button type="submit" className="linkish">
                    Sign out
                  </button>
                </form>
              </nav>
            ) : (
              viewer && <span className="who">{viewer.personName}</span>
            )}
          </div>
        </header>
        <main id="main" className="app-main">
          {children}
        </main>
      </body>
    </html>
  );
}
