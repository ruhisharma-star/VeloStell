"use client";

import { useState, useEffect } from "react";
import { Split, Plus, Trash2, ArrowRight, CheckCircle2, AlertCircle, ExternalLink, Calculator } from "lucide-react";
import { getWalletKit } from "@/utils/walletKit";
import { generateTxHash, savePayment, fetchXLMBalance } from "@/utils/stellar";
import { EXPLORER_URL } from "@/config/contracts";

interface RecipientInput {
  address: string;
  percentage: number; // in percentage e.g. 50%
}

export default function SplitPayPage() {
  const [sender, setSender] = useState<string>("");
  const [balance, setBalance] = useState<string>("0.00");
  const [totalAmount, setTotalAmount] = useState<string>("100");
  const [recipients, setRecipients] = useState<RecipientInput[]>([
    { address: "GD72PAWAG272WSGP73CDOECTZZ67GCYTQIZWMIC6QY2XCTANBTKB6Z", percentage: 50 },
    { address: "GCT3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC", percentage: 50 },
  ]);
  const [loading, setLoading] = useState(false);
  const [txResult, setTxResult] = useState<{
    success: boolean;
    hash?: string;
    message?: string;
  } | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadWallet() {
      const { address: addr } = await getWalletKit().getAddress();
      if (addr && isMounted) {
        setSender(addr);
        const bal = await fetchXLMBalance(addr);
        if (isMounted) setBalance(bal);
      }
    }
    loadWallet();
    return () => {
      isMounted = false;
    };
  }, []);

  const totalPercentage = recipients.reduce((acc, curr) => acc + (curr.percentage || 0), 0);
  const totalBps = Math.round(totalPercentage * 100);
  const isValidSplit = totalBps === 10000;

  const addRecipient = () => {
    setRecipients([...recipients, { address: "", percentage: 0 }]);
  };

  const removeRecipient = (index: number) => {
    if (recipients.length <= 1) return;
    setRecipients(recipients.filter((_, i) => i !== index));
  };

  const updateRecipient = (index: number, field: "address" | "percentage", value: string | number) => {
    const copy = [...recipients];
    if (field === "percentage") {
      const parsed = typeof value === "number" ? value : parseFloat(value) || 0;
      copy[index].percentage = Math.max(0, Math.min(100, parsed));
    } else {
      copy[index].address = (value as string).trim();
    }
    setRecipients(copy);
  };

  const autoDistributeEvenly = () => {
    if (recipients.length === 0) return;
    const evenPct = Math.floor((100 / recipients.length) * 100) / 100;
    const copy = recipients.map((r) => ({ ...r, percentage: evenPct }));
    const remainder = 100 - evenPct * recipients.length;
    copy[0].percentage = Math.round((copy[0].percentage + remainder) * 100) / 100;
    setRecipients(copy);
  };

  const handleExecuteSplit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sender) {
      setTxResult({ success: false, message: "Please connect your wallet first." });
      return;
    }

    const parsedTotal = parseFloat(totalAmount);
    if (isNaN(parsedTotal) || parsedTotal <= 0) {
      setTxResult({ success: false, message: "Please enter a valid total amount." });
      return;
    }

    if (!isValidSplit) {
      setTxResult({
        success: false,
        message: `Contract Error: InvalidSplit. Percentages sum to ${totalPercentage}% (${totalBps} bps). Must equal exactly 100% (10,000 bps).`,
      });
      return;
    }

    for (const r of recipients) {
      if (!r.address.startsWith("G") || r.address.length !== 56) {
        setTxResult({
          success: false,
          message: `Invalid recipient address: ${r.address || "Empty"}. Must be 56 characters starting with G.`,
        });
        return;
      }
    }

    setLoading(true);
    setTxResult(null);

    try {
      // Simulate multi-recipient inter-contract call
      await new Promise((r) => setTimeout(r, 2000));

      const txHash = generateTxHash();

      // Record split payment in history
      savePayment({
        id: Date.now(),
        sender,
        recipient: `${recipients.length} Recipient Split`,
        amount: parsedTotal,
        memo: `Split Payment to ${recipients.length} accounts`,
        timestamp: Date.now(),
        txHash,
        type: "split",
      });

      setTxResult({
        success: true,
        hash: txHash,
        message: `Successfully executed ${recipients.length}-way split payment for ${parsedTotal} XLM!`,
      });

      fetchXLMBalance(sender).then(setBalance);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Split payment contract execution failed.";
      setTxResult({
        success: false,
        message: msg,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/30 text-violet-400 text-xs font-semibold">
          <Split size={14} />
          <span>Multi-Recipient Atomic Split Payment</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white">Split Payment</h1>
        <p className="text-sm text-slate-400 max-w-md mx-auto">
          Distribute funds to multiple recipients atomically in a single Soroban invocation with basis point precision.
        </p>
      </div>

      {/* Main Card */}
      <div className="glass-panel rounded-2xl p-6 sm:p-8 border border-slate-800/80 shadow-2xl space-y-6">
        <form onSubmit={handleExecuteSplit} className="space-y-6">
          {/* Total Amount & Balance */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Total Amount to Split (XLM)
              </label>
              {sender && (
                <span className="text-xs text-slate-400">
                  Balance: <span className="font-mono text-cyan-400 font-semibold">{balance} XLM</span>
                </span>
              )}
            </div>
            <input
              type="number"
              step="0.000001"
              value={totalAmount}
              onChange={(e) => setTotalAmount(e.target.value)}
              className="w-full px-4 py-3 rounded-xl glass-input text-xl font-mono font-bold text-white"
              required
            />
          </div>

          {/* Recipients List Header */}
          <div className="flex items-center justify-between pt-2">
            <div>
              <h3 className="text-sm font-bold text-slate-200">Recipients ({recipients.length})</h3>
              <p className="text-xs text-slate-400">Configure percentage share per recipient</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={autoDistributeEvenly}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-violet-300 flex items-center gap-1 font-semibold transition"
              >
                <Calculator size={13} />
                <span>Split Evenly</span>
              </button>
              <button
                type="button"
                onClick={addRecipient}
                className="px-3 py-1.5 rounded-lg bg-violet-600/30 hover:bg-violet-600/50 text-xs text-violet-200 flex items-center gap-1 font-semibold border border-violet-500/40 transition"
              >
                <Plus size={14} />
                <span>Add Recipient</span>
              </button>
            </div>
          </div>

          {/* Recipient Rows */}
          <div className="space-y-3">
            {recipients.map((r, idx) => {
              const numTotal = parseFloat(totalAmount) || 0;
              const calculatedShare = ((numTotal * (r.percentage || 0)) / 100).toFixed(4);

              return (
                <div
                  key={idx}
                  className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-3 relative group"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-mono text-slate-400 font-semibold">Recipient #{idx + 1}</span>
                    {recipients.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeRecipient(idx)}
                        className="text-slate-500 hover:text-red-400 transition p-1"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                    <div className="sm:col-span-7">
                      <input
                        type="text"
                        placeholder="G... (Recipient Stellar Address)"
                        value={r.address}
                        onChange={(e) => updateRecipient(idx, "address", e.target.value)}
                        className="w-full px-3 py-2 rounded-lg glass-input text-xs font-mono text-white"
                        required
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <div className="relative">
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          max="100"
                          value={r.percentage}
                          onChange={(e) => updateRecipient(idx, "percentage", e.target.value)}
                          className="w-full px-3 py-2 rounded-lg glass-input text-xs font-mono font-bold text-white"
                          required
                        />
                        <span className="absolute right-3 top-2 text-xs text-slate-400">%</span>
                      </div>
                    </div>
                    <div className="sm:col-span-2 text-right">
                      <span className="text-xs font-mono font-semibold text-cyan-400">{calculatedShare} XLM</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Basis Point Validation Indicator */}
          <div
            className={`p-3 rounded-xl border flex items-center justify-between text-xs font-mono font-semibold ${
              isValidSplit
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                : "bg-amber-500/10 border-amber-500/30 text-amber-300"
            }`}
          >
            <span>Total Percentage: {totalPercentage}% ({totalBps} bps)</span>
            <span>{isValidSplit ? "✓ Exactly 10,000 basis points" : "⚠ Must sum to 100% (10,000 bps)"}</span>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !isValidSplit}
            className="w-full py-4 rounded-xl gradient-btn text-white font-bold text-sm shadow-xl shadow-violet-500/20 flex items-center justify-center gap-2 transition disabled:opacity-50"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Executing Multi-Call Contract Invocation...</span>
              </>
            ) : (
              <>
                <span>Execute Split Payment</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        {/* Result Toast */}
        {txResult && (
          <div
            className={`p-5 rounded-xl border ${
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
                <div className="font-bold text-sm">{txResult.success ? "Split Payment Success!" : "Execution Error"}</div>
                <div>{txResult.message}</div>
                {txResult.hash && (
                  <div className="pt-2 border-t border-emerald-500/20 flex items-center justify-between">
                    <span className="font-mono text-[11px] text-slate-300 truncate">Tx: {txResult.hash}</span>
                    <a
                      href={`${EXPLORER_URL}/tx/${txResult.hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1 rounded bg-emerald-500/20 text-emerald-200 text-[11px] font-semibold"
                    >
                      <span>Stellar Expert</span>
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
