import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";

export const metadata: Metadata = {
  title: "Velostell | Smart Payments on Stellar",
  description: "Next-generation Soroban payment dApp supporting Direct Pay, Split Payments, and Recurring Escrow Streams on Stellar Testnet.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="font-sans antialiased text-slate-100 min-h-screen flex flex-col justify-between">
        <div>
          <Navbar />
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
            {children}
          </main>
        </div>
        <footer className="border-t border-slate-800/80 bg-slate-950/60 py-6 text-center text-xs text-slate-500">
          <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>Velostell Soroban Smart Payments • Stellar Testnet</span>
            </div>
            <div>
              <span>Powered by Soroban Rust SDK &amp; Native Stellar Asset Contract (SAC)</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
