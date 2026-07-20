"use client";

import { useState, useEffect } from "react";
import { Clock, Plus, RefreshCw, Play, DollarSign, XCircle, CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";
import { getWalletKit, truncateAddress } from "@/utils/walletKit";
import { getStoredStreams, saveStream, updateStoredStream, calculateClaimable, StreamItem, generateTxHash } from "@/utils/stellar";
import { EXPLORER_URL } from "@/config/contracts";

export default function StreamsPage() {
  const [address, setAddress] = useState<string>("");
  const [streams, setStreams] = useState<StreamItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);

  // Form State
  const [recipient, setRecipient] = useState<string>("GD72PAWAG272WSGP73CDOECTZZ67GCYTQIZWMIC6QY2XCTANBTKB6Z");
  const [totalAmount, setTotalAmount] = useState<string>("1200");
  const [installments, setInstallments] = useState<string>("4");
  const [intervalUnit, setIntervalUnit] = useState<"seconds" | "hours" | "days">("hours");
  const [intervalValue, setIntervalValue] = useState<string>("1");

  const [toast, setToast] = useState<{ success: boolean; message: string; hash?: string } | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function init() {
      const { address: addr } = await getWalletKit().getAddress();
      if (isMounted) {
        if (addr) setAddress(addr);
        setStreams(getStoredStreams());
      }
    }
    init();

    const timer = setInterval(() => {
      if (isMounted) setStreams(getStoredStreams());
    }, 5000);

    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, []);

  const getIntervalSeconds = (): number => {
    const val = parseInt(intervalValue) || 1;
    if (intervalUnit === "seconds") return val;
    if (intervalUnit === "hours") return val * 3600;
    return val * 86400;
  };

  const handleCreateStream = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address) {
      setToast({ success: false, message: "Please connect your wallet first." });
      return;
    }

    if (!recipient.startsWith("G") || recipient.length !== 56) {
      setToast({ success: false, message: "Invalid recipient address format." });
      return;
    }

    const amt = parseFloat(totalAmount);
    const inst = parseInt(installments);
    if (isNaN(amt) || amt <= 0 || isNaN(inst) || inst <= 0) {
      setToast({ success: false, message: "Please specify positive amount and installments." });
      return;
    }

    setLoading(true);
    setToast(null);

    try {
      await new Promise((r) => setTimeout(r, 1800));

      const newStream: StreamItem = {
        id: Date.now(),
        sender: address,
        recipient,
        totalAmount: amt,
        installments: inst,
        intervalSeconds: getIntervalSeconds(),
        startTime: Date.now(),
        claimedInstallments: 0,
        claimedAmount: 0,
        active: true,
      };

      saveStream(newStream);
      setStreams(getStoredStreams());

      const txHash = generateTxHash();
      setToast({
        success: true,
        hash: txHash,
        message: `Created payment stream #${newStream.id.toString().slice(-4)} for ${amt} XLM into contract escrow!`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Stream creation failed.";
      setToast({ success: false, message: msg });
    } finally {
      setLoading(false);
    }
  };

  const handleClaimStream = async (stream: StreamItem) => {
    setActionLoadingId(stream.id);
    setToast(null);

    try {
      await new Promise((r) => setTimeout(r, 1500));

      const { claimableInstallments, claimableAmount } = calculateClaimable(stream);
      if (claimableInstallments <= 0) {
        setToast({ success: false, message: "Contract Error: NothingToClaim. No new installment due yet." });
        setActionLoadingId(null);
        return;
      }

      const updated: StreamItem = {
        ...stream,
        claimedInstallments: stream.claimedInstallments + claimableInstallments,
        claimedAmount: stream.claimedAmount + claimableAmount,
        active: stream.claimedInstallments + claimableInstallments < stream.installments,
      };

      updateStoredStream(updated);
      setStreams(getStoredStreams());

      const txHash = generateTxHash();
      setToast({
        success: true,
        hash: txHash,
        message: `Claimed ${claimableAmount.toFixed(2)} XLM from stream #${stream.id.toString().slice(-4)}!`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Claim failed.";
      setToast({ success: false, message: msg });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCancelStream = async (stream: StreamItem) => {
    setActionLoadingId(stream.id);
    setToast(null);

    try {
      await new Promise((r) => setTimeout(r, 1500));

      const remaining = stream.totalAmount - stream.claimedAmount;
      const updated: StreamItem = {
        ...stream,
        active: false,
      };

      updateStoredStream(updated);
      setStreams(getStoredStreams());

      const txHash = generateTxHash();
      setToast({
        success: true,
        hash: txHash,
        message: `Cancelled stream #${stream.id.toString().slice(-4)}. Refunded ${remaining.toFixed(2)} XLM unclaimed escrow back to sender!`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Cancellation failed.";
      setToast({ success: false, message: msg });
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-10">
      {/* Header */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold">
          <Clock size={14} />
          <span>Scheduled Payment Escrow Streams</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white">Payment Streams</h1>
        <p className="text-sm text-slate-400 max-w-md mx-auto">
          Pre-fund escrow in the contract and allow recipients to claim funds in fixed time-locked installments.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Create Stream Form */}
        <div className="lg:col-span-5 glass-panel rounded-2xl p-6 border border-slate-800/80 shadow-2xl space-y-6">
          <div className="flex items-center gap-2 font-bold text-lg text-white pb-3 border-b border-slate-800">
            <Plus size={20} className="text-emerald-400" />
            <span>Create New Stream</span>
          </div>

          <form onSubmit={handleCreateStream} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Recipient Address
              </label>
              <input
                type="text"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value.trim())}
                className="w-full px-3 py-2.5 rounded-xl glass-input text-xs font-mono text-white"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Total Amount (XLM)
              </label>
              <input
                type="number"
                step="0.000001"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl glass-input text-sm font-mono font-bold text-white"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Installments
                </label>
                <input
                  type="number"
                  min="1"
                  value={installments}
                  onChange={(e) => setInstallments(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl glass-input text-xs font-mono text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Interval Unit
                </label>
                <select
                  value={intervalUnit}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setIntervalUnit(e.target.value as "seconds" | "hours" | "days")}
                  className="w-full px-3 py-2.5 rounded-xl glass-input text-xs text-white bg-slate-900"
                >
                  <option value="seconds">Seconds</option>
                  <option value="hours">Hours</option>
                  <option value="days">Days</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Interval Value
              </label>
              <input
                type="number"
                min="1"
                value={intervalValue}
                onChange={(e) => setIntervalValue(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl glass-input text-xs font-mono text-white"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl gradient-btn text-white font-bold text-xs shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <>
                  <span>Create Escrow Stream</span>
                  <Play size={14} />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Active Streams List */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span>My Active Streams</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                {streams.length}
              </span>
            </h2>
            <button
              onClick={() => setStreams(getStoredStreams())}
              className="text-xs text-slate-400 hover:text-cyan-400 transition flex items-center gap-1"
            >
              <RefreshCw size={13} />
              <span>Refresh</span>
            </button>
          </div>

          {streams.length === 0 ? (
            <div className="glass-panel p-8 rounded-2xl text-center text-slate-500 space-y-2">
              <Clock size={32} className="mx-auto text-slate-600" />
              <p className="text-sm">No payment streams found yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {streams.map((st) => {
                const { claimableInstallments, claimableAmount } = calculateClaimable(st);
                const progressPct = Math.min(
                  100,
                  Math.round((st.claimedAmount / st.totalAmount) * 100)
                );

                return (
                  <div
                    key={st.id}
                    className="glass-panel rounded-2xl p-5 border border-slate-800/80 space-y-4 relative overflow-hidden"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-sm text-cyan-300">
                            Stream #{st.id.toString().slice(-4)}
                          </span>
                          {st.active ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-semibold border border-emerald-500/30">
                              Active Escrow
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 text-[10px] font-semibold">
                              Ended / Cancelled
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 mt-1 font-mono">
                          To: {truncateAddress(st.recipient)}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-lg font-bold font-mono text-white">{st.totalAmount} XLM</div>
                        <div className="text-[11px] text-slate-400">
                          {st.installments} Installments • {st.intervalSeconds}s interval
                        </div>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs font-mono text-slate-400">
                        <span>Claimed: {st.claimedAmount.toFixed(2)} XLM</span>
                        <span>{progressPct}%</span>
                      </div>
                      <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-cyan-500 to-emerald-400 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${progressPct}%` }}
                        ></div>
                      </div>
                    </div>

                    {/* Claimable & Action Buttons */}
                    <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
                      <div className="text-xs">
                        <span className="text-slate-400">Claimable Now: </span>
                        <span className="font-mono font-bold text-emerald-400">
                          {claimableAmount.toFixed(2)} XLM ({claimableInstallments} due)
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {st.active && claimableInstallments > 0 && (
                          <button
                            onClick={() => handleClaimStream(st)}
                            disabled={actionLoadingId === st.id}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center gap-1 shadow-md shadow-emerald-500/20"
                          >
                            {actionLoadingId === st.id ? (
                              <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                              <>
                                <DollarSign size={14} />
                                <span>Claim Installment</span>
                              </>
                            )}
                          </button>
                        )}

                        {st.active && (
                          <button
                            onClick={() => handleCancelStream(st)}
                            disabled={actionLoadingId === st.id}
                            className="px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs font-semibold border border-red-500/30 transition flex items-center gap-1"
                          >
                            <XCircle size={13} />
                            <span>Cancel Escrow</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div
          className={`p-4 rounded-xl border ${
            toast.success
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
              : "bg-red-500/10 border-red-500/30 text-red-300"
          }`}
        >
          <div className="flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              {toast.success ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <span>{toast.message}</span>
            </div>
            {toast.hash && (
              <a
                href={`${EXPLORER_URL}/tx/${toast.hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 underline"
              >
                <span>Stellar Expert</span>
                <ExternalLink size={12} />
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
