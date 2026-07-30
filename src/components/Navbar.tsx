"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wallet, Send, Split, Clock, History, LogOut, RefreshCw } from "lucide-react";
import { getWalletKit, truncateAddress } from "@/utils/walletKit";
import { fetchXLMBalance } from "@/utils/stellar";
import WalletModal from "./WalletModal";

export default function Navbar() {
  const pathname = usePathname();
  const [address, setAddress] = useState<string>("");
  const [balance, setBalance] = useState<string>("0.00");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loadingBalance, setLoadingBalance] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function updateBalance(addr: string) {
      if (!addr) return;
      setLoadingBalance(true);
      const bal = await fetchXLMBalance(addr);
      if (isMounted) {
        setBalance(bal);
        setLoadingBalance(false);
      }
    }

    async function loadAddress() {
      const kit = getWalletKit();
      const { address: addr } = await kit.getAddress();
      if (addr && isMounted) {
        setAddress(addr);
        updateBalance(addr);
      }
    }

    loadAddress();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleManualBalanceRefresh = async () => {
    if (!address) return;
    setLoadingBalance(true);
    const bal = await fetchXLMBalance(address);
    setBalance(bal);
    setLoadingBalance(false);
  };

  const handleDisconnect = () => {
    getWalletKit().disconnect();
    setAddress("");
    setBalance("0.00");
  };

  const navLinks = [
    { name: "Direct Pay", href: "/", icon: Send },
    { name: "Split Pay", href: "/split", icon: Split },
    { name: "Streams", href: "/streams", icon: Clock },
    { name: "History", href: "/history", icon: History },
  ];

  return (
    <>
      <header className="sticky top-0 z-40 w-full glass-panel border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-9 h-9 rounded-xl gradient-btn flex items-center justify-center text-white shadow-lg shadow-cyan-500/20 group-hover:scale-105 transition">
                <Send size={18} className="-rotate-45" />
              </div>
              <div className="flex flex-col">
                <span className="font-black text-xl tracking-tight text-white flex items-center gap-1.5">
                  Velo<span className="gradient-text">stell</span>
                </span>
                <span className="text-[10px] text-slate-400 -mt-1 font-mono tracking-wider">SOROBAN PAYMENTS</span>
              </div>
            </Link>

            {/* Nav Links Desktop */}
            <nav className="hidden md:flex items-center gap-1 bg-slate-900/60 p-1 rounded-xl border border-slate-800/60">
              {navLinks.map((link) => {
                const Icon = link.icon;
                const active = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                      active
                        ? "bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-cyan-300 border border-cyan-500/30"
                        : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                    }`}
                  >
                    <Icon size={15} />
                    <span>{link.name}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right Section: Balance & Wallet */}
          <div className="flex items-center gap-3">
            {address ? (
              <div className="flex items-center gap-2">
                {/* Balance Pill */}
                <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800/80 text-xs">
                  <span className="text-slate-400">Balance:</span>
                  <span className="font-mono font-bold text-cyan-400">{balance} XLM</span>
                  <button
                    onClick={handleManualBalanceRefresh}
                    title="Refresh Balance"
                    className="text-slate-500 hover:text-cyan-400 transition ml-0.5"
                  >
                    <RefreshCw size={12} className={loadingBalance ? "animate-spin text-cyan-400" : ""} />
                  </button>
                </div>

                {/* Wallet Badge & Disconnect */}
                <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-900/90 border border-slate-800/80">
                  <div className="px-2.5 py-1 rounded-lg bg-cyan-500/10 text-cyan-300 font-mono text-xs font-semibold flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                    <span>{truncateAddress(address)}</span>
                  </div>
                  <button
                    onClick={handleDisconnect}
                    title="Disconnect Wallet"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition"
                  >
                    <LogOut size={15} />
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setIsModalOpen(true)}
                className="gradient-btn px-4 py-2 rounded-xl text-xs font-bold text-white shadow-lg shadow-cyan-500/20 flex items-center gap-2"
              >
                <Wallet size={16} />
                <span>Connect Wallet</span>
              </button>
            )}
          </div>
        </div>

        {/* Mobile Navigation Bar */}
        <div className="md:hidden flex items-center justify-around border-t border-slate-800/80 bg-slate-950/90 px-2 py-2">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex flex-col items-center gap-1 px-3 py-1 rounded-lg text-[11px] font-medium transition ${
                  active ? "text-cyan-400" : "text-slate-400"
                }`}
              >
                <Icon size={18} />
                <span>{link.name}</span>
              </Link>
            );
          })}
        </div>
      </header>

      <WalletModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConnected={(addr) => {
          setAddress(addr);
          handleManualBalanceRefresh();
        }}
      />
    </>
  );
}
