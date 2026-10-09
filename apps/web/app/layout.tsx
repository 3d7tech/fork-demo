import type { Metadata, Viewport } from 'next';
import '@fork/ui/fork.css';
import './app.css';
import { getViewer } from '@/lib/viewer';
import { THEME_SCRIPT, ThemeToggle } from './ThemeToggle';

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
    { media: '(prefers-color-scheme: light)', color: '#f6f6f3' },
    { media: '(prefers-color-scheme: dark)', color: '#0c0d0b' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  return (
    <html lang="en-GB" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&family=JetBrains+Mono:wght@400;500;700&family=Schibsted+Grotesk:wght@400;500;600;700;800&display=swap" />
      </head>
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <header className="app-bar">
          <div className="app-bar-in">
            {/* A full page load, so going home also clears an answer on screen. */}
            <a href="/" className="brand">
              <span className="brand-mark" aria-hidden="true" />
              <strong>Fork</strong> {viewer && <span className="co">{viewer.companyName}</span>}
            </a>
            {viewer?.mode === 'db' ? (
              <nav aria-label="Account">
                {viewer.role === 'employee' && <span className="who">{viewer.personName}</span>}
                {viewer.role !== 'accountant' && <a href="/">Home</a>}
                {viewer.role === 'owner' && <a href="/dashboard">Dashboard</a>}
                {viewer.role === 'owner' && <a href="/setup">Setup</a>}
                {viewer.role !== 'accountant' && <a href="/decisions">My decisions</a>}
                {viewer.role === 'accountant' && <a href="/accountant">Requests</a>}
                {viewer.canSwitch && <a href="/switch">Switch</a>}
                <ThemeToggle />
                <form action="/signout" method="post">
                  <button type="submit" className="linkish">
                    Sign out
                  </button>
                </form>
              </nav>
            ) : (
              <nav aria-label="Account">
                {viewer && <span className="who">{viewer.personName}</span>}
                <ThemeToggle />
              </nav>
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
