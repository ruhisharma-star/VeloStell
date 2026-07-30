"use client";

import { useState, useEffect } from "react";
import { ArrowRight, CheckCircle2, AlertCircle, ExternalLink, ShieldCheck, Zap } from "lucide-react";
import { getWalletKit, truncateAddress } from "@/utils/walletKit";
import { executeRealDirectPayment, savePayment, fetchXLMBalance } from "@/utils/stellar";
import { EXPLORER_URL } from "@/config/contracts";

export default function DirectPayPage() {
  const [address, setAddress] = useState<string>("");
  const [recipient, setRecipient] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [memo, setMemo] = useState<string>("");
  const [balance, setBalance] = useState<string>("0.00");
  const [loading, setLoading] = useState(false);

  const [txResult, setTxResult] = useState<{
    success: boolean;
    hash?: string;
    message?: string;
  } | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function init() {
      const { address: addr } = await getWalletKit().getAddress();
      if (addr && isMounted) {
        setAddress(addr);
        const bal = await fetchXLMBalance(addr);
        if (isMounted) setBalance(bal);
      }
    }
    init();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSendPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address) {
      setTxResult({ success: false, message: "Please connect your wallet first." });
      return;
    }

    if (!recipient || !recipient.startsWith("G") || recipient.length !== 56) {
      setTxResult({ success: false, message: "Please enter a valid Stellar recipient address (starts with G, 56 chars)." });
      return;
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setTxResult({ success: false, message: "Please enter a valid positive XLM amount." });
      return;
    }

    setLoading(true);
    setTxResult(null);

    try {
      // Triggers real Freighter extension pop-up and submits tx to Stellar Testnet
      const txHash = await executeRealDirectPayment(address, recipient, amount, memo || "Direct XLM Payment");

      // Record transaction locally
      savePayment({
        id: Date.now(),
        sender: address,
        recipient,
        amount: numAmount,
        memo: memo || "Direct XLM Payment",
        timestamp: Date.now(),
        txHash,
        type: "direct",
      });

      setTxResult({
        success: true,
        hash: txHash,
        message: `Successfully transferred ${numAmount} XLM to ${truncateAddress(recipient)}!`,
      });

      setAmount("");
      setMemo("");
      fetchXLMBalance(address).then(setBalance);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transaction failed or rejected by wallet.";
      setTxResult({
        success: false,
        message: msg,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Hero Header */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-semibold">
          <Zap size={14} />
          <span>Soroban Smart Payments • Level 3 Scope</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white">Direct XLM Payment</h1>
        <p className="text-sm text-slate-400 max-w-md mx-auto">
          Execute instant, memo-tagged value transfers signed directly via your Freighter Wallet on Stellar Testnet.
        </p>
      </div>

      {/* Main Payment Form Card */}
      <div className="glass-panel rounded-2xl p-6 sm:p-8 border border-slate-800/80 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-3xl -z-10"></div>

        <form onSubmit={handleSendPayment} className="space-y-6">
          {/* Recipient Address */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Recipient Stellar Address
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="G..."
                value={recipient}
                onChange={(e) => setRecipient(e.target.value.trim())}
                className="w-full px-4 py-3 rounded-xl glass-input text-sm font-mono text-white placeholder-slate-500"
                required
              />
              <button
                type="button"
                onClick={() => setRecipient("GD72PAWAG272WSGP73CDOECTZZ67GCYTQIZWMIC6QY2XCTANBTKB6Z")}
                className="absolute right-3 top-2.5 text-[11px] px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-400 font-mono transition"
              >
                Sample Recipient
              </button>
            </div>
          </div>

          {/* Amount & Balance */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Amount (XLM)
              </label>
              {address && (
                <span className="text-xs text-slate-400">
                  Available: <span className="font-mono text-cyan-400 font-semibold">{balance} XLM</span>
                </span>
              )}
            </div>
            <div className="relative">
              <input
                type="number"
                step="0.000001"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-4 py-3 rounded-xl glass-input text-lg font-mono font-bold text-white placeholder-slate-500"
                required
              />
              <span className="absolute right-4 top-3.5 text-xs font-bold text-slate-400">XLM</span>
            </div>
          </div>

          {/* Memo / Payment Reference */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Memo / Invoice Reference
            </label>
            <input
              type="text"
              placeholder="e.g. Invoice #1042, Web Services Payment"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              className="w-full px-4 py-3 rounded-xl glass-input text-sm text-white placeholder-slate-500"
            />
          </div>

          {/* Inter-Contract Details Banner */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 text-xs space-y-1 text-slate-400">
            <div className="flex items-center gap-2 text-slate-200 font-semibold mb-1">
              <ShieldCheck size={14} className="text-cyan-400" />
              <span>Real Wallet Signing Active</span>
            </div>
            <div>• Submitting will open your <strong className="text-cyan-300">Freighter Wallet Popup</strong> to sign.</div>
            <div>• Real XLM will be debited on Stellar Testnet upon approval.</div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 rounded-xl gradient-btn text-white font-bold text-sm shadow-xl shadow-cyan-500/20 flex items-center justify-center gap-2 group transition"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Awaiting Freighter Wallet Signature...</span>
              </>
            ) : (
              <>
                <span>Send Direct Payment</span>
                <ArrowRight size={16} className="group-hover:translate-x-1 transition" />
              </>
            )}
          </button>
        </form>

        {/* Transaction Result Toast / Card */}
        {txResult && (
          <div
            className={`mt-6 p-5 rounded-xl border ${
              txResult.success
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                : "bg-red-500/10 border-red-500/30 text-red-300"
            }`}
          >
            <div className="flex items-start gap-3">
              {txResult.success ? (
                <CheckCircle2 size={20} className="shrink-0 text-emerald-400 mt-0.5" />
              ) : (
                <AlertCircle size={20} className="shrink-0 text-red-400 mt-0.5" />
              )}
              <div className="space-y-2 text-xs flex-1">
                <div className="font-bold text-sm">{txResult.success ? "Payment Executed!" : "Execution Error"}</div>
                <div>{txResult.message}</div>

                {txResult.hash && (
                  <div className="pt-2 border-t border-emerald-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                    <div className="font-mono text-[11px] text-slate-300 truncate max-w-xs">
                      Tx: {txResult.hash}
                    </div>
                    <a
                      href={`${EXPLORER_URL}/tx/${txResult.hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 text-[11px] font-semibold transition"
                    >
                      <span>View on Stellar Expert</span>
                      <ExternalLink size={12} />
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
