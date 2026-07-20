import { HORIZON_URL, RPC_URL, VELOSTELL_CONTRACT_ID, XLM_SAC_ID } from "../config/contracts";

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
  // Default seed data for rich demo
  return [
    {
      id: 1,
      sender: "GBXGQJWVLWOYHFLVTKWXR532W3X5W236MTRVLL3Q6Q76CYST",
      recipient: "GD72PAWAG272WSGP73CDOECTZZ67GCYTQIZWMIC6QY2XCTANBTKB6Z",
      amount: 150.0,
      memo: "Invoice #1042 - Web Dev Services",
      timestamp: Date.now() - 3600000 * 24,
      txHash: "7b4a2c91839e0d1f42a6c1e9564d2bf789a421e35901cd678e09bf1a4325e89d",
      type: "direct",
    },
    {
      id: 2,
      sender: "GBXGQJWVLWOYHFLVTKWXR532W3X5W236MTRVLL3Q6Q76CYST",
      recipient: "GCT3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
      amount: 50.0,
      memo: "Team Coffee Split",
      timestamp: Date.now() - 3600000 * 48,
      txHash: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2",
      type: "split",
    },
  ];
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
  return [
    {
      id: 1,
      sender: "GBXGQJWVLWOYHFLVTKWXR532W3X5W236MTRVLL3Q6Q76CYST",
      recipient: "GAB2RMQQVU2HHGCYSC6QY2XCTANBTKB6ZCDIARVPAWAG272WSGP73CD",
      totalAmount: 1200.0,
      installments: 4,
      intervalSeconds: 3600, // 1 hour intervals
      startTime: Date.now() - 7200000, // 2 hours ago
      claimedInstallments: 1,
      claimedAmount: 300.0,
      active: true,
    },
  ];
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

// Simulated transaction hash helper for real-feeling testing or when Freighter signs
export function generateTxHash(): string {
  const chars = "abcdef0123456789";
  let hash = "";
  for (let i = 0; i < 64; i++) {
    hash += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return hash;
}
