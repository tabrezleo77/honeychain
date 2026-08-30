import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HoneyChain Platform - Web3 IoT Supply Chain Tracker",
  description: "Dynamic Web3 Supply Chain Integrity & IoT Verification for Honey Production",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>
        <div className="min-h-screen flex flex-col justify-between">
          <header className="border-b border-white/5 bg-black/30 backdrop-blur-md sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-amber-500 to-yellow-400 flex items-center justify-center shadow-lg shadow-amber-500/20 font-bold text-black text-xl">
                  🍯
                </div>
                <span className="font-extrabold text-xl tracking-tight text-white">
                  HONEY<span className="text-amber-500">CHAIN</span>
                </span>
              </div>
              <nav className="flex gap-6 text-sm font-medium text-zinc-400">
                <a href="/" className="hover:text-white transition">Home</a>
                <a href="/dashboard/farmer" className="hover:text-white transition">Farmer PWA</a>
                <a href="/dashboard/lab" className="hover:text-white transition">Lab Portal</a>
                <a href="/dashboard/admin" className="hover:text-white transition">Admin Portal</a>
              </nav>
            </div>
          </header>

          <main className="flex-grow max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {children}
          </main>

          <footer className="border-t border-white/5 bg-black/40 py-6 text-center text-xs text-zinc-500">
            &copy; 2026 HoneyChain. All rights reserved. Government (KVIC & MadhuKranti) Sync Attested.
          </footer>
        </div>
      </body>
    </html>
  );
}
