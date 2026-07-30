import { isConnected, getAddress as freighterGetAddress, requestAccess } from "@stellar/freighter-api";
import albedo from "@albedo-link/intent";

class CustomWalletKit {
  private activeWallet: string = "Freighter";
  private address: string = "";

  setConnectedAddress(address: string, walletName: string) {
    this.address = address;
    this.activeWallet = walletName;
    if (typeof window !== "undefined") {
      localStorage.setItem("stellar_wallet_address", address);
      localStorage.setItem("stellar_wallet_name", walletName);
    }
  }

  getWalletName(): string {
    if (typeof window !== "undefined") {
      return localStorage.getItem("stellar_wallet_name") || this.activeWallet;
    }
    return this.activeWallet;
  }

  async connectFreighter(): Promise<string> {
    try {
      const accessObj = await requestAccess();
      if (accessObj?.address) {
        this.setConnectedAddress(accessObj.address, "Freighter");
        return accessObj.address;
      }
      const { address } = await freighterGetAddress();
      if (address) {
        this.setConnectedAddress(address, "Freighter");
        return address;
      }
      throw new Error("Freighter wallet not connected or access denied.");
    } catch (e: unknown) {
      console.error("Freighter connect error:", e);
      throw e;
    }
  }

  async connectAlbedo(): Promise<string> {
    try {
      const res = await albedo.publicKey({});
      if (res.pubkey) {
        this.setConnectedAddress(res.pubkey, "Albedo");
        return res.pubkey;
      }
      throw new Error("Could not connect to Albedo wallet.");
    } catch (e: unknown) {
      console.error("Albedo connect error:", e);
      throw e;
    }
  }

  async connectXBull(): Promise<string> {
    try {
      const win = typeof window !== "undefined" ? (window as unknown as { xbull?: { getPublicKey: () => Promise<string> } }) : undefined;
      if (win?.xbull) {
        const pubkey = await win.xbull.getPublicKey();
        if (pubkey) {
          this.setConnectedAddress(pubkey, "xBull");
          return pubkey;
        }
      }
      throw new Error("xBull Wallet extension is not installed in your browser.");
    } catch (e: unknown) {
      console.error("xBull connect error:", e);
      throw e;
    }
  }

  connectDemo(demoAddress: string = "GBXGQJWVLWOYHFLVTKWXR532W3X5W236MTRVLL3Q6Q76CYST"): string {
    this.setConnectedAddress(demoAddress, "Demo Wallet");
    return demoAddress;
  }

  async getAddress(): Promise<{ address: string }> {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("stellar_wallet_address");
      if (stored) return { address: stored };
    }

    try {
      if (await isConnected()) {
        const { address } = await freighterGetAddress();
        if (address) {
          this.setConnectedAddress(address, "Freighter");
          return { address };
        }
      }
    } catch (e) {
      console.error("Freighter check error:", e);
    }
    return { address: this.address };
  }

  disconnect() {
    this.address = "";
    if (typeof window !== "undefined") {
      localStorage.removeItem("stellar_wallet_address");
      localStorage.removeItem("stellar_wallet_name");
    }
  }
}

let kitInstance: CustomWalletKit | null = null;

export const getWalletKit = () => {
  if (typeof window === "undefined") {
    return {} as CustomWalletKit;
  }
  if (!kitInstance) {
    kitInstance = new CustomWalletKit();
  }
  return kitInstance;
};

export function truncateAddress(addr: string, startChars = 5, endChars = 4): string {
  if (!addr) return "";
  if (addr.length <= startChars + endChars) return addr;
  return `${addr.slice(0, startChars)}...${addr.slice(-endChars)}`;
}
