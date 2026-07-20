"use client";

import { useState, useEffect } from "react";
import { History, Search, ExternalLink, Send, Split, RefreshCw } from "lucide-react";
import { truncateAddress } from "@/utils/walletKit";
import { getStoredPayments, PaymentRecordItem } from "@/utils/stellar";
import { EXPLORER_URL } from "@/config/contracts";

export default function PaymentHistoryPage() {
  const [payments, setPayments] = useState<PaymentRecordItem[]>([]);
  const [filterType, setFilterType] = useState<"all" | "direct" | "split">("all");
  const [searchTerm, setSearchTerm] = useState<string>("");

  useEffect(() => {
    let isMounted = true;
    async function init() {
      const data = getStoredPayments();
      if (isMounted) setPayments(data);
    }
    init();
    return () => {
      isMounted = false;
    };
  }, []);

  const refreshHistory = () => {
    setPayments(getStoredPayments());
  };

  const filteredPayments = payments.filter((p) => {
    if (filterType !== "all" && p.type !== filterType) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      return (
        p.sender.toLowerCase().includes(q) ||
        p.recipient.toLowerCase().includes(q) ||
        p.memo.toLowerCase().includes(q) ||
        (p.txHash && p.txHash.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white flex items-center gap-2.5">
            <History size={26} className="text-cyan-400" />
            <span>Payment History</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Real-time audit log of direct, split, and contract payment transfers on Stellar Testnet
          </p>
        </div>

        <button
          onClick={refreshHistory}
          className="self-start sm:self-auto px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-xs text-slate-300 flex items-center gap-1.5 transition"
        >
          <RefreshCw size={14} />
          <span>Refresh History</span>
        </button>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-900/80 border border-slate-800/80 w-full sm:w-auto">
          <button
            onClick={() => setFilterType("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              filterType === "all" ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30" : "text-slate-400"
            }`}
          >
            All Types ({payments.length})
          </button>
          <button
            onClick={() => setFilterType("direct")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              filterType === "direct" ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30" : "text-slate-400"
            }`}
          >
            Direct ({payments.filter((p) => p.type === "direct").length})
          </button>
          <button
            onClick={() => setFilterType("split")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              filterType === "split" ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30" : "text-slate-400"
            }`}
          >
            Split ({payments.filter((p) => p.type === "split").length})
          </button>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-64">
          <input
            type="text"
            placeholder="Search memo, address or tx hash..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl glass-input text-xs text-white placeholder-slate-500"
          />
          <Search size={14} className="absolute left-3 top-2.5 text-slate-500" />
        </div>
      </div>

      {/* Payment Table / List */}
      {filteredPayments.length === 0 ? (
        <div className="glass-panel p-10 rounded-2xl text-center text-slate-500 space-y-2">
          <History size={36} className="mx-auto text-slate-600" />
          <p className="text-sm">No payment records match your search query.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredPayments.map((p) => {
            const isDirect = p.type === "direct";
            const dateStr = new Date(p.timestamp).toLocaleString();

            return (
              <div
                key={p.id}
                className="glass-panel rounded-2xl p-4 sm:p-5 border border-slate-800/80 hover:border-slate-700/80 transition space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                        isDirect
                          ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                          : "bg-violet-500/20 text-violet-400 border border-violet-500/30"
                      }`}
                    >
                      {isDirect ? <Send size={16} /> : <Split size={16} />}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-white">{p.memo}</span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase ${
                            isDirect
                              ? "bg-cyan-500/10 text-cyan-300 border border-cyan-500/20"
                              : "bg-violet-500/10 text-violet-300 border border-violet-500/20"
                          }`}
                        >
                          {p.type}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                        From: {truncateAddress(p.sender)} → To: {truncateAddress(p.recipient)}
                      </div>
                    </div>
                  </div>

                  <div className="text-right flex sm:flex-col justify-between items-center sm:items-end">
                    <div className="text-lg font-bold font-mono text-cyan-400">+{p.amount} XLM</div>
                    <div className="text-[10px] text-slate-500">{dateStr}</div>
                  </div>
                </div>

                {p.txHash && (
                  <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-xs">
                    <span className="font-mono text-[11px] text-slate-400 truncate max-w-xs sm:max-w-md">
                      Tx: {p.txHash}
                    </span>
                    <a
                      href={`${EXPLORER_URL}/tx/${p.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 font-medium transition"
                    >
                      <span>Explorer</span>
                      <ExternalLink size={12} />
                    </a>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
