import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "National Honey Quality Verification Portal - Government of India (KVIC & MadhuKranti)",
  description: "Official Web3 & IoT Honey Quality Verification Platform - Beekeeper, Government, and Public Buyer Access",
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
        <link href="https://fonts.googleapis.com/css2?family=GFS+Didot&display=swap" rel="stylesheet" />
      </head>
      <body className="bg-white text-black min-h-screen flex flex-col justify-between">
        <div>
          {/* Top National Government Banner */}
          <div className="bg-gray-100 border-b border-gray-200 py-1.5 px-4 text-center text-xs font-mono text-gray-700 flex items-center justify-between max-w-7xl mx-auto">
            <div className="flex items-center gap-2">
              <span className="font-bold text-gray-900">🏛️ GOVERNMENT OF INDIA</span>
              <span className="text-gray-400">|</span>
              <span>Ministry of Micro, Small & Medium Enterprises (KVIC)</span>
            </div>
            <div className="hidden sm:flex items-center gap-3 text-[11px] text-gray-600">
              <span>MadhuKranti Portal Sync: Active</span>
              <span className="text-emerald-600 font-bold">● ONLINE</span>
            </div>
          </div>

          {/* Main Navigation Header */}
          <header className="border-b border-gray-200 bg-white sticky top-0 z-50 shadow-sm">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded border border-amber-400/50 bg-amber-50 flex items-center justify-center font-bold text-amber-600 text-2xl shadow-sm">
                  🍯
                </div>
                <div>
                  <h1 className="text-2xl font-extrabold tracking-wider text-gold font-gfs-didot">
                    HONEYCHAIN PORTAL
                  </h1>
                  <p className="text-[11px] font-mono text-gray-600 tracking-tight">
                    National Honey Traceability & Quality Assurance
                  </p>
                </div>
              </div>

              <nav className="flex gap-6 text-xs font-mono font-bold text-black">
                <a href="/" className="hover:text-amber-600 transition border-b-2 border-amber-500 pb-1">
                  1. BEEKEEPER AUTH
                </a>
                <a href="/dashboard/admin" className="hover:text-amber-600 transition pb-1">
                  2. GOVERNMENT AUTH
                </a>
                <a href="/verify/HC-BATCH-2026-X89" className="hover:text-amber-600 transition pb-1 text-amber-700">
                  3. BUYER PUBLIC QR
                </a>
                <a href="/devices" className="hover:text-amber-600 transition pb-1 text-gray-500">
                  📡 IoT Devices
                </a>
              </nav>
            </div>
          </header>

          <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 bg-white">
            {children}
          </main>
        </div>

        <footer className="border-t border-gray-200 bg-gray-50 py-6 text-center text-xs font-mono text-gray-600">
          <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              &copy; 2026 National Honey Certification & MadhuKranti Registry. KVIC Attested.
            </div>
            <div className="flex items-center gap-4 text-[11px] text-gray-500">
              <span>Privacy Policy</span>
              <span>•</span>
              <span>Terms of Service</span>
              <span>•</span>
              <span>Polygon Web3 Attestation: Amoy Testnet</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
