import { HORIZON_URL, NETWORK_PASSPHRASE, VELOSTELL_CONTRACT_ID, XLM_SAC_ID, RPC_URL } from "../config/contracts";
import { isConnected, signTransaction } from "@stellar/freighter-api";
import { 
  TransactionBuilder, 
  Contract, 
  nativeToScVal, 
  scValToNative, 
  xdr, 
  rpc as StellarRpc,
  Transaction
} from "@stellar/stellar-sdk";
import { getWalletKit } from "./walletKit";

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
  id: number; // This will map to the contract's stream_id
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

interface HorizonBalance {
  asset_type?: string;
  balance: string;
}

const rpcServer = new StellarRpc.Server(RPC_URL);

/**
 * Generic helper to build, simulate (prepare), sign via Freighter, and submit a Soroban contract transaction.
 * Returns the transaction hash and the parsed return value of the contract function.
 */
export async function executeSorobanCall(
  sender: string,
  methodName: string,
  args: xdr.ScVal[]
): Promise<{ txHash: string; returnValue?: unknown }> {
  const freighterConnected = await isConnected().catch(() => false);
  if (!freighterConnected) {
    throw new Error("Freighter wallet is not connected or extension is missing.");
  }

  // 1. Fetch source account sequence number
  const sourceAccount = await rpcServer.getAccount(sender);
  const contract = new Contract(VELOSTELL_CONTRACT_ID);

  // 2. Build initial transaction containing the contract call operation
  let tx = new TransactionBuilder(sourceAccount, {
    fee: "10000",
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(methodName, ...args))
    .setTimeout(60)
    .build();

  // 3. Prepare the transaction (simulate, compute footprints, CPU/RAM resource fees)
  tx = await rpcServer.prepareTransaction(tx);

  // 4. Request Freighter signature
  const unsignedXdr = tx.toXDR();
  const signedXdrResult = await signTransaction(unsignedXdr, {
    networkPassphrase: NETWORK_PASSPHRASE,
  });

  const signedXdr = typeof signedXdrResult === "string" ? signedXdrResult : signedXdrResult?.signedTxXdr;
  if (!signedXdr) {
    throw new Error("Transaction signature was not provided by Freighter.");
  }

  // 5. Submit transaction to Soroban network
  const signedTx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE) as Transaction;
  const sendRes = await rpcServer.sendTransaction(signedTx);

  if (sendRes.status === "ERROR") {
    const errorMsg = sendRes.errorResult
      ? sendRes.errorResult.toXDR("base64")
      : "Failed to submit transaction to Soroban RPC.";
    throw new Error(errorMsg);
  }

  // 6. Poll transaction status
  const maxAttempts = 30;
  for (let i = 0; i < maxAttempts; i++) {
    const statusRes = await rpcServer.getTransaction(sendRes.hash);
    if (statusRes.status === "SUCCESS") {
      let returnValue: unknown = undefined;
      if (statusRes.returnValue) {
        returnValue = scValToNative(statusRes.returnValue);
      }
      return { txHash: sendRes.hash, returnValue };
    } else if (statusRes.status === "FAILED") {
      throw new Error(`Transaction execution failed on ledger: ${statusRes.resultXdr}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error("Transaction polling timed out on Stellar Testnet.");
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
    const nativeBal = data.balances?.find((b: HorizonBalance) => b.asset_type === "native");
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

// Execute payment transaction calling contract send_payment
export async function executeRealDirectPayment(
  sender: string,
  recipient: string,
  amountXlm: string,
  memoText: string
): Promise<string> {
  const walletName = getWalletKit().getWalletName();
  if (walletName === "Demo Wallet") {
    return generateTxHash();
  }

  // Scale amount to 7 decimals for Soroban i128 contract representation
  const stroopAmount = BigInt(Math.round(parseFloat(amountXlm) * 10000000));

  const args = [
    nativeToScVal(sender, { type: "address" }),
    nativeToScVal(recipient, { type: "address" }),
    nativeToScVal(XLM_SAC_ID, { type: "address" }),
    nativeToScVal(stroopAmount, { type: "i128" }),
    nativeToScVal(memoText || "Direct Payment", { type: "string" }),
  ];

  const res = await executeSorobanCall(sender, "send_payment", args);
  return res.txHash;
}

// Execute split payment transaction calling contract split_payment
export async function executeRealSplitPayment(
  sender: string,
  totalAmountXlm: string,
  recipients: { address: string; percentage: number }[]
): Promise<string> {
  const walletName = getWalletKit().getWalletName();
  if (walletName === "Demo Wallet") {
    return generateTxHash();
  }

  const stroopTotal = BigInt(Math.round(parseFloat(totalAmountXlm) * 10000000));

  // Convert percentages to basis points (50% -> 5000 bps)
  const bpsArray = recipients.map(r => Math.round(r.percentage * 100));

  const args = [
    nativeToScVal(sender, { type: "address" }),
    nativeToScVal(XLM_SAC_ID, { type: "address" }),
    nativeToScVal(stroopTotal, { type: "i128" }),
    xdr.ScVal.scvVec(recipients.map(r => nativeToScVal(r.address, { type: "address" }))),
    xdr.ScVal.scvVec(bpsArray.map(bps => nativeToScVal(bps, { type: "u32" }))),
  ];

  const res = await executeSorobanCall(sender, "split_payment", args);
  return res.txHash;
}

// Execute stream creation calling contract create_stream
export async function executeRealCreateStream(
  sender: string,
  recipient: string,
  totalAmountXlm: string,
  installments: number,
  intervalSeconds: number
): Promise<{ txHash: string; streamId: number }> {
  const walletName = getWalletKit().getWalletName();
  if (walletName === "Demo Wallet") {
    return { txHash: generateTxHash(), streamId: Date.now() };
  }

  const stroopTotal = BigInt(Math.round(parseFloat(totalAmountXlm) * 10000000));

  const args = [
    nativeToScVal(sender, { type: "address" }),
    nativeToScVal(recipient, { type: "address" }),
    nativeToScVal(XLM_SAC_ID, { type: "address" }),
    nativeToScVal(stroopTotal, { type: "i128" }),
    nativeToScVal(installments, { type: "u32" }),
    nativeToScVal(BigInt(intervalSeconds), { type: "u64" }),
  ];

  const res = await executeSorobanCall(sender, "create_stream", args);
  const streamId = res.returnValue !== undefined ? Number(res.returnValue) : Date.now();
  return { txHash: res.txHash, streamId };
}

// Execute stream claim calling contract claim_stream
export async function executeRealClaimStream(
  streamId: number,
  recipient: string
): Promise<string> {
  const walletName = getWalletKit().getWalletName();
  if (walletName === "Demo Wallet") {
    return generateTxHash();
  }

  const args = [
    nativeToScVal(streamId, { type: "u32" }),
    nativeToScVal(recipient, { type: "address" }),
  ];

  const res = await executeSorobanCall(recipient, "claim_stream", args);
  return res.txHash;
}

// Execute stream cancellation calling contract cancel_stream
export async function executeRealCancelStream(
  streamId: number,
  sender: string
): Promise<string> {
  const walletName = getWalletKit().getWalletName();
  if (walletName === "Demo Wallet") {
    return generateTxHash();
  }

  const args = [
    nativeToScVal(streamId, { type: "u32" }),
    nativeToScVal(sender, { type: "address" }),
  ];

  const res = await executeSorobanCall(sender, "cancel_stream", args);
  return res.txHash;
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
// PaymentRecordItem represents a single payment history entry.
// type field distinguishes between direct and split payments.
// StreamItem represents an active or completed streaming payment.
// HorizonBalance defines the balance structure from Stellar Horizon API.
// Ensure asset_type is optional for native balances.
// rpcServer is the shared instance for Soroban RPC calls.
// generateTxHash is only used when the Demo Wallet is selected.
// fallback generator returns 64 char hex string.
// fetchXLMBalance retrieves the native XLM balance for a given public key.
// executeRealDirectPayment triggers the send_payment smart contract method.
// executeRealSplitPayment splits a total amount into multiple recipients based on bps.
// BPS array uses basis points (10000 = 100%) for accurate contract division.
// executeRealCreateStream sets up a new time-based payment stream.
// executeRealClaimStream claims available installments from a stream.
// Sender must match the stream creator for successful cancellation.
// STORAGE_KEY_PAYMENTS is the local storage key for transaction history.
// STORAGE_KEY_STREAMS is the local storage key for active streams.
// Use v1 suffix for potential future migrations.
// getStoredPayments retrieves local transaction history.
// savePayment prepends a new transaction to the local history.
// getStoredStreams retrieves locally saved streaming payments.
// saveStream stores a new streaming payment locally.
