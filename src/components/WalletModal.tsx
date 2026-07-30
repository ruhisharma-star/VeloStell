"use client";

import { useState } from "react";
import { X, Wallet, ShieldCheck, Globe, Cpu, Zap, AlertCircle } from "lucide-react";
import { getWalletKit } from "@/utils/walletKit";

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnected: (address: string) => void;
}

export default function WalletModal({ isOpen, onClose, onConnected }: WalletModalProps) {
  const [loadingWallet, setLoadingWallet] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFreighterConnect = async () => {
    setLoadingWallet("Freighter");
    setError(null);
    try {
      const addr = await getWalletKit().connectFreighter();
      onConnected(addr);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not connect to Freighter wallet. Make sure the extension is installed.";
      setError(msg);
    } finally {
      setLoadingWallet(null);
    }
  };

  const handleAlbedoConnect = async () => {
    setLoadingWallet("Albedo");
    setError(null);
    try {
      const addr = await getWalletKit().connectAlbedo();
      onConnected(addr);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not connect to Albedo web wallet.";
      setError(msg);
    } finally {
      setLoadingWallet(null);
    }
  };

  const handleXBullConnect = async () => {
    setLoadingWallet("xBull");
    setError(null);
    try {
      const addr = await getWalletKit().connectXBull();
      onConnected(addr);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "xBull wallet extension is not installed in your browser.";
      setError(msg);
    } finally {
      setLoadingWallet(null);
    }
  };

  const handleDemoConnect = () => {
    const addr = getWalletKit().connectDemo();
    onConnected(addr);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="glass-panel w-full max-w-md rounded-2xl p-6 shadow-2xl relative border border-slate-700/60 space-y-6">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg transition"
        >
          <X size={20} />
        </button>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
            <Wallet size={22} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Connect Wallet</h2>
            <p className="text-xs text-slate-400">Select a Stellar wallet provider to interact with Soroban</p>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-2 text-red-400 text-xs">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-3">
          {/* Freighter */}
          <button
            onClick={handleFreighterConnect}
            disabled={loadingWallet !== null}
            className="w-full flex items-center justify-between p-3.5 rounded-xl glass-input hover:bg-slate-800/80 transition group text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 group-hover:scale-105 transition">
                <ShieldCheck size={20} />
              </div>
              <div>
                <div className="font-semibold text-sm text-slate-100">Freighter Wallet</div>
                <div className="text-xs text-slate-400">Official Soroban Browser Extension</div>
              </div>
            </div>
            {loadingWallet === "Freighter" ? (
              <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <span className="text-xs px-2.5 py-1 rounded bg-cyan-500/20 text-cyan-300 font-medium">Extension</span>
            )}
          </button>

          {/* Albedo */}
          <button
            onClick={handleAlbedoConnect}
            disabled={loadingWallet !== null}
            className="w-full flex items-center justify-between p-3.5 rounded-xl glass-input hover:bg-slate-800/80 transition group text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400 group-hover:scale-105 transition">
                <Globe size={20} />
              </div>
              <div>
                <div className="font-semibold text-sm text-slate-100">Albedo Wallet</div>
                <div className="text-xs text-slate-400">Web-based Web3 authorization (No extension)</div>
              </div>
            </div>
            {loadingWallet === "Albedo" ? (
              <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <span className="text-xs px-2.5 py-1 rounded bg-purple-500/20 text-purple-300 font-medium">Web Link</span>
            )}
          </button>

          {/* xBull */}
          <button
            onClick={handleXBullConnect}
            disabled={loadingWallet !== null}
            className="w-full flex items-center justify-between p-3.5 rounded-xl glass-input hover:bg-slate-800/80 transition group text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 group-hover:scale-105 transition">
                <Cpu size={20} />
              </div>
              <div>
                <div className="font-semibold text-sm text-slate-100">xBull Wallet</div>
                <div className="text-xs text-slate-400">Browser Extension &amp; Mobile DeFi Wallet</div>
              </div>
            </div>
            {loadingWallet === "xBull" ? (
              <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <span className="text-xs px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 font-medium">Browser/Mobile</span>
            )}
          </button>

          {/* Instant Demo */}
          <button
            onClick={handleDemoConnect}
            className="w-full flex items-center justify-between p-3.5 rounded-xl glass-input hover:bg-slate-800/80 transition group text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 group-hover:scale-105 transition">
                <Zap size={20} />
              </div>
              <div>
                <div className="font-semibold text-sm text-slate-100">Instant Demo Account</div>
                <div className="text-xs text-slate-400">Pre-funded Testnet wallet (Instant testing)</div>
              </div>
            </div>
            <span className="text-xs px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 font-medium">Quick Demo</span>
          </button>
        </div>

        <div className="pt-2 border-t border-slate-800/80 text-center text-xs text-slate-500">
          Network: <span className="text-slate-300 font-medium">Stellar Testnet</span>
        </div>
      </div>
    </div>
  );
}
