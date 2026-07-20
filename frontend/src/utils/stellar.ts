import { HORIZON_URL, RPC_URL, VELOSTELL_CONTRACT_ID, XLM_SAC_ID, NETWORK_PASSPHRASE } from "../config/contracts";
import { isConnected, signTransaction } from "@stellar/freighter-api";
import { Account, TransactionBuilder, Operation, Asset } from "@stellar/stellar-sdk";

export interface PaymentRecordItem {
  id: number;
  sender: string;
  recipient: string;
  amount: number; // in XLM
  memo: string;
  timestamp: number; // ms timestamp
  txHash?: string;
  type: "direct" | "split";
}

export interface StreamItem {
  id: number;
  sender: string;
  recipient: string;
  totalAmount: number; // in XLM
  installments: number;
  intervalSeconds: number;
  startTime: number; // ms timestamp
  claimedInstallments: number;
  claimedAmount: number; // in XLM
  active: boolean;
}

// Fetch XLM balance from Horizon Testnet
export async function fetchXLMBalance(address: string): Promise<string> {
  if (!address) return "0.00";
  try {
    const res = await fetch(`${HORIZON_URL}/accounts/${address}`);
    if (!res.ok) {
      if (res.status === 404) return "0.00 (Unfunded)";
      return "0.00";
    }
    const data = await res.json();
    const nativeBal = data.balances?.find((b: any) => b.asset_type === "native");
    if (nativeBal) {
      return parseFloat(nativeBal.balance).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 7,
      });
    }
    return "0.00";
  } catch (err) {
    console.error("Error fetching balance:", err);
    return "0.00";
  }
}

// Execute real payment transaction with Freighter wallet pop-up signing
export async function executeRealDirectPayment(
  sender: string,
  recipient: string,
  amountXlm: string,
  memoText: string
): Promise<string> {
  const freighterConnected = await isConnected().catch(() => false);

  if (freighterConnected) {
    // 1. Fetch account sequence number from Horizon Testnet
    const accRes = await fetch(`${HORIZON_URL}/accounts/${sender}`);
    if (!accRes.ok) {
      throw new Error("Sender account not found or unfunded on Testnet. Please fund your wallet via Stellar Friendbot.");
    }
    const accData = await accRes.json();
    const account = new Account(sender, accData.sequence);

    // 2. Build Stellar Payment Transaction XDR
    const tx = new TransactionBuilder(account, {
      fee: "10000",
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(
        Operation.payment({
          destination: recipient,
          asset: Asset.native(),
          amount: amountXlm,
        })
      )
      .setTimeout(30)
      .build();

    const unsignedXdr = tx.toXDR();

    // 3. Trigger Freighter Browser Wallet Pop-up for signing
    let signedXdrResult: any;
    try {
      signedXdrResult = await signTransaction(unsignedXdr, {
        networkPassphrase: NETWORK_PASSPHRASE,
      });
    } catch (e: any) {
      throw new Error(e?.message || "User cancelled or rejected transaction in Freighter.");
    }

    const signedXdr = typeof signedXdrResult === "string" ? signedXdrResult : signedXdrResult?.signedTxXdr;
    if (!signedXdr) {
      throw new Error("Transaction signature was not provided by wallet.");
    }

    // 4. Submit signed transaction to Stellar Testnet Horizon RPC
    const submitRes = await fetch(`${HORIZON_URL}/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `tx=${encodeURIComponent(signedXdr)}`,
    });

    const submitJson = await submitRes.json();
    if (submitJson.hash) {
      return submitJson.hash;
    } else if (submitJson.extras?.result_codes?.transaction) {
      throw new Error(`Stellar Transaction Failed: ${submitJson.extras.result_codes.transaction}`);
    } else {
      throw new Error(submitJson.detail || "Transaction submission failed on Stellar Testnet.");
    }
  } else {
    // If user is in Demo Wallet mode (no extension)
    return generateTxHash();
  }
}

// In-memory / LocalStorage state manager for responsive real-time dApp behavior
const STORAGE_KEY_PAYMENTS = "velostell_payments_v1";
const STORAGE_KEY_STREAMS = "velostell_streams_v1";

export function getStoredPayments(): PaymentRecordItem[] {
  if (typeof window === "undefined") return [];
  try {
    const data = localStorage.getItem(STORAGE_KEY_PAYMENTS);
    if (data) return JSON.parse(data);
  } catch (e) {
    console.error(e);
  }
  return [];
}

export function savePayment(record: PaymentRecordItem) {
  const current = getStoredPayments();
  const updated = [record, ...current];
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY_PAYMENTS, JSON.stringify(updated));
  }
}

export function getStoredStreams(): StreamItem[] {
  if (typeof window === "undefined") return [];
  try {
    const data = localStorage.getItem(STORAGE_KEY_STREAMS);
    if (data) return JSON.parse(data);
  } catch (e) {
    console.error(e);
  }
  return [];
}

export function saveStream(stream: StreamItem) {
  const current = getStoredStreams();
  const updated = [stream, ...current];
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY_STREAMS, JSON.stringify(updated));
  }
}

export function updateStoredStream(updatedStream: StreamItem) {
  const current = getStoredStreams();
  const idx = current.findIndex((s) => s.id === updatedStream.id);
  if (idx !== -1) {
    current[idx] = updatedStream;
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY_STREAMS, JSON.stringify(current));
    }
  }
}

// Calculate claimable installments and claimable amount for a stream
export function calculateClaimable(stream: StreamItem): {
  claimableInstallments: number;
  claimableAmount: number;
  nextClaimTimeMs: number;
} {
  if (!stream.active) {
    return { claimableInstallments: 0, claimableAmount: 0, nextClaimTimeMs: 0 };
  }
  const now = Date.now();
  const elapsedSeconds = Math.floor((now - stream.startTime) / 1000);
  const elapsedIntervals = Math.floor(elapsedSeconds / stream.intervalSeconds);
  const totalDueInstallments = Math.min(elapsedIntervals, stream.installments);

  const claimableInstallments = Math.max(0, totalDueInstallments - stream.claimedInstallments);

  let claimableAmount = 0;
  if (claimableInstallments > 0) {
    if (totalDueInstallments === stream.installments) {
      claimableAmount = stream.totalAmount - stream.claimedAmount;
    } else {
      const perInstallment = stream.totalAmount / stream.installments;
      claimableAmount = perInstallment * claimableInstallments;
    }
  }

  const nextInterval = (stream.claimedInstallments + 1) * stream.intervalSeconds;
  const nextClaimTimeMs = stream.startTime + nextInterval * 1000;

  return { claimableInstallments, claimableAmount, nextClaimTimeMs };
}

// Generated Tx Hash helper for fallback demo mode
export function generateTxHash(): string {
  const chars = "abcdef0123456789";
  let hash = "";
  for (let i = 0; i < 64; i++) {
    hash += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return hash;
}
