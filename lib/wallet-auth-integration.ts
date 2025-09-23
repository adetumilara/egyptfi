import { WalletRequestError } from "@starknet-react/core";
import toast from "react-hot-toast";
// import { auth } from "@clerk/nextjs/server";
// import { useUser } from "@clerk/nextjs";

// Types and Interfaces
export interface WalletResponse {
  publicKey?: string;
  wallet?: { publicKey: string };
  address?: string;
  accountAddress?: string;
  txHash?: string;
}

export interface MerchantData {
  id: string;
  name?: string;
  business_email?: string;
}

export interface DbResult {
  success?: boolean;
  message?: string;
  merchant: MerchantData;
  apiKeys?: {
    publicKey: string;
    jwt: string;
  };
}

export interface WalletCreationParams {
  pin?: string; // Original PIN entered by user
  encryptKey?: string; // Pre-encrypted key (alternative to pin)
  externalUserId: any;
  network?: "testnet" | "mainnet";
  encryptionSalt?: string; // Optional salt for PIN encryption
}

export interface WalletCreationConfig {
  autoGenerateKey?: boolean;
  enableLocalStorage?: boolean;
  showSuccessToast?: boolean;
  showErrorToast?: boolean;
  updateMerchantRecord?: boolean;
  maxRetries?: number;
  retryDelay?: number;
  exponentialBackoff?: boolean;
}

export interface WalletCreationResult {
  success: boolean;
  walletResponse?: WalletResponse;
  publicKey?: string;
  encryptKey?: string;
  error?: string;
}

// Utility Functions
export const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

export const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000,
  exponentialBackoff: boolean = true
): Promise<T> => {
  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxRetries) {
        throw lastError;
      }

      // Calculate delay with exponential backoff
      const delay = exponentialBackoff
        ? baseDelay * Math.pow(2, attempt)
        : baseDelay;

      console.log(
        `Attempt ${attempt + 1} failed, retrying in ${delay}ms...`,
        lastError.message
      );
      await sleep(delay);
    }
  }

  throw lastError!;
};

export const generateSecureEncryptKey = (): string => {
  // Use crypto API if available (more secure)
  if (
    typeof window !== "undefined" &&
    window.crypto &&
    window.crypto.getRandomValues
  ) {
    const array = new Uint8Array(16);
    window.crypto.getRandomValues(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join(
      ""
    );
  }

  // Fallback for environments without crypto API
  let result = "";
  const hexChars = "0123456789abcdef";
  for (let i = 0; i < 32; i++) {
    result += hexChars.charAt(Math.floor(Math.random() * hexChars.length));
  }
  return result;
};

export const validatePin = (pin: string): boolean => {
  // Validate PIN (can be numeric or alphanumeric)
  return pin.length >= 4 && pin.length <= 32;
};

export const validateEncryptKey = (key: string): boolean => {
  return key.length >= 4 && key.length <= 64 && /^[0-9a-fA-F]*$/i.test(key);
};

// PIN encryption function using Web Crypto API
export const encryptPin = async (
  pin: string,
  salt?: string
): Promise<string> => {
  if (
    typeof window === "undefined" ||
    !window.crypto ||
    !window.crypto.subtle
  ) {
    // Fallback: Simple hash-based encryption for environments without Web Crypto API
    return hashPin(pin, salt);
  }

  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(pin + (salt || "chipi-wallet-salt"));

    // Create a simple hash using Web Crypto API
    const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return hashHex;
  } catch (error) {
    console.warn("Web Crypto API failed, using fallback:", error);
    return hashPin(pin, salt);
  }
};

// Fallback hash function for environments without Web Crypto API
export const hashPin = (
  pin: string,
  salt: string = "chipi-wallet-salt"
): string => {
  let hash = 0;
  const str = pin + salt;

  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  // Convert to positive hex string
  const positiveHash = Math.abs(hash);
  return positiveHash.toString(16).padStart(8, "0");
};

export const extractPublicKey = (
  walletResponse: WalletResponse
): string | null => {
  return (
    walletResponse?.publicKey ||
    walletResponse?.wallet?.publicKey ||
    walletResponse?.address ||
    walletResponse?.accountAddress ||
    null
  );
};

export const safeLocalStorageSet = (key: string, value: string): boolean => {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      localStorage.setItem(key, value);
      return true;
    }
    return false;
  } catch (error) {
    console.warn("Failed to store data in localStorage:", error);
    return false;
  }
};

export const safeLocalStorageGet = (key: string): string | null => {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return localStorage.getItem(key);
    }
    return null;
  } catch (error) {
    console.warn("Failed to retrieve data from localStorage:", error);
    return null;
  }
};

// Core Service Functions
export const updateMerchantWallet = async (
  merchantId: string,
  walletAddress: string,
  jwtToken: string,
  encryptedPin: string, // Add encrypted PIN parameter
  apiKey: string,
  environment: string
): Promise<{ success: boolean; error?: string }> => {
  console.log("merchantId", merchantId);
  console.log("wallet address", walletAddress);
  console.log("wallet MMMMMMMMMMMMMMMMMMMMMMMMMMMMM", jwtToken);
  console.log("API KEY", apiKey);
  console.log("Environment", environment);
  if (!walletAddress)
    return {
      success: false,
      error: "No wallet address",
    };
  try {
    const response = await fetch("/api/merchants/update-wallet", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwtToken}`,
        "x-api-key": `${apiKey}`,
        "x-environment": `${environment}`,
      },
      body: JSON.stringify({
        merchantId,
        chipiWalletAddress: walletAddress,
        encryptedPin, // Send encrypted PIN
      }),
    });

    const data = await response.json();

    console.log(data);

    if (response.ok) {
      console.log("Merchant wallet updated successfully");
      return { success: true };
    } else {
      console.error("Failed to update merchant wallet:", data.error);
      return {
        success: false,
        error: data.error || "Failed to update merchant record",
      };
    }
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : "Network error occurred";
    console.error("Error updating merchant wallet:", error);
    return { success: false, error: errorMsg };
  }
};

export const createWalletWithMerchantUpdate = async (
  dbResult: DbResult,
  createWalletAsync: any,
  setLoading: (loading: boolean) => void,
  setError: (error: string | null) => void,
  params?: Partial<WalletCreationParams>,
  key?: any,
  config?: WalletCreationConfig
): Promise<WalletCreationResult> => {
  // Default configuration
  const defaultConfig: WalletCreationConfig = {
    autoGenerateKey: true,
    enableLocalStorage: true,
    showSuccessToast: true,
    showErrorToast: true,
    updateMerchantRecord: true,
    maxRetries: 3,
    retryDelay: 1000,
    exponentialBackoff: true,
    ...config,
  };

  // Extract merchant and network info
  const merchant = dbResult.merchant;
  const network = params?.network || "mainnet";
  const jwtToken = dbResult.apiKeys?.jwt;
  const apiKey = dbResult.apiKeys?.publicKey;

  // For ChipiPay API calls, we need to use a token that ChipiPay recognizes
  // If ChipiPay production is not configured for Clerk test tokens, use internal JWT
  const clerkToken = key;
  // const chipiToken = jwtToken || clerkToken; // Fallback to internal JWT if needed

  console.log(
    "Using token for ChipiPay:",
    clerkToken ? "Available" : "Missing"
  );

  // Validation
  if (!clerkToken) {
    const error = `No authentication token available for ${network} wallet creation`;
    setError(error);
    if (defaultConfig.showErrorToast) {
      toast.error("Failed to create wallet: No authentication token");
    }
    return { success: false, error };
  }

  // Handle PIN vs encryptKey logic
  let originalPin: string | undefined;
  let encryptKeyForWallet: string | undefined;
  let encryptedPinForMerchant: string | undefined;

  if (params?.pin) {
    // User provided a PIN - validate it
    if (!validatePin(params.pin)) {
      const error = "Invalid PIN format (must be 4-32 characters)";
      setError(error);
      if (defaultConfig.showErrorToast) {
        toast.error(error);
      }
      return { success: false, error };
    }

    originalPin = params.pin;
    encryptKeyForWallet = originalPin; // Send original PIN to createWalletAsync

    // Encrypt PIN for merchant update
    try {
      encryptedPinForMerchant = await encryptPin(
        originalPin,
        params?.encryptionSalt
      );
    } catch (error) {
      const errorMsg = "Failed to encrypt PIN";
      setError(errorMsg);
      if (defaultConfig.showErrorToast) {
        toast.error(errorMsg);
      }
      return { success: false, error: errorMsg };
    }
  } else if (params?.encryptKey) {
    // User provided pre-encrypted key
    if (!validateEncryptKey(params.encryptKey)) {
      const error = "Invalid encryption key format";
      setError(error);
      if (defaultConfig.showErrorToast) {
        toast.error(error);
      }
      return { success: false, error };
    }
    encryptKeyForWallet = params.encryptKey;
    encryptedPinForMerchant = params.encryptKey; // Use as-is for merchant
  } else if (defaultConfig.autoGenerateKey) {
    // Auto-generate key
    encryptKeyForWallet = generateSecureEncryptKey();
    encryptedPinForMerchant = encryptKeyForWallet; // Use generated key
  }

  if (!encryptKeyForWallet || !encryptedPinForMerchant) {
    const error = "PIN or encryption key is required";
    setError(error);
    return { success: false, error };
  }

  // Start wallet creation process
  setLoading(true);
  setError(null);

  try {
    // Create wallet with retry logic
    console.log("Token", clerkToken);

    const walletResponse = await retryWithBackoff(
      async () => {
        return await createWalletAsync({
          params: {
            encryptKey: encryptKeyForWallet, // Send original PIN or generated key
            externalUserId: params?.externalUserId,
          },
          bearerToken: clerkToken, // Use the token that ChipiPay accepts
        });
      },
      defaultConfig.maxRetries,
      defaultConfig.retryDelay,
      defaultConfig.exponentialBackoff
    );

    console.log("Wallet created successfully:", walletResponse);

    // Extract public key
    const publicKey = extractPublicKey(walletResponse);
    console.log("public key", publicKey);
    if (!publicKey) {
      console.warn("Wallet response did not contain publicKey");

      if (defaultConfig.showErrorToast) {
        toast("Wallet created but address extraction failed", { icon: "⚠️" });
      }
    }

    // Store original PIN or generated key locally if enabled
    if (
      defaultConfig.enableLocalStorage &&
      (originalPin || encryptKeyForWallet)
    ) {
      const storageKey = `encryptKey_${merchant.id}_${network}`;
      const keyToStore = originalPin || encryptKeyForWallet!;
      const stored = safeLocalStorageSet(storageKey, keyToStore);
      if (!stored && defaultConfig.showErrorToast) {
        toast("Wallet created but failed to store key locally", { icon: "⚠️" });
      }
    }

    // Update merchant record if enabled and public key is available
    let merchantUpdateSuccess = true;
    if (
      defaultConfig.updateMerchantRecord &&
      publicKey &&
      encryptedPinForMerchant &&
      jwtToken // Ensure jwtToken exists
    ) {
      console.log(jwtToken);
      console.log(apiKey);
      const updateResult = await retryWithBackoff(
        async () => {
          return await updateMerchantWallet(
            merchant.id,
            publicKey,
            jwtToken, // Now guaranteed to be string
            encryptedPinForMerchant,
            apiKey || "", // Send encrypted PIN
            // "mainnet"
            "testnet"
          );
        },
        defaultConfig.maxRetries,
        defaultConfig.retryDelay,
        defaultConfig.exponentialBackoff
      );
      merchantUpdateSuccess = updateResult.success;

      if (updateResult.success) {
        if (defaultConfig.showSuccessToast) {
          toast.success("Wallet linked to merchant account");
        }
      } else {
        console.error("Failed to update merchant record:", updateResult.error);
        if (defaultConfig.showErrorToast) {
          toast.error("Wallet created but failed to update merchant record");
        }
      }
    } else if (defaultConfig.updateMerchantRecord && !jwtToken) {
      console.warn("Skipping merchant record update: No JWT token available");
      if (defaultConfig.showErrorToast) {
        toast("Wallet created but merchant record not updated (no JWT token)", {
          icon: "⚠️",
        });
      }
    }

    // Success message
    if (defaultConfig.showSuccessToast) {
      const message = merchantUpdateSuccess
        ? `${
            network.charAt(0).toUpperCase() + network.slice(1)
          } wallet created successfully!`
        : `${
            network.charAt(0).toUpperCase() + network.slice(1)
          } wallet created (with warnings)`;
      toast.success(message);
    }

    return {
      success: true,
      walletResponse,
      publicKey: publicKey || undefined,
      encryptKey: originalPin || encryptKeyForWallet, // Return the original PIN or key used
    };
  } catch (error) {
    console.error("Wallet creation failed:", error);

    let errorMsg = "Wallet creation failed";
    if (error instanceof Error) {
      errorMsg = error.message;
    } else if (typeof error === "string") {
      errorMsg = error;
    } else if (error && typeof error === "object" && "message" in error) {
      errorMsg = (error as any).message;
    }

    setError(errorMsg);
    if (defaultConfig.showErrorToast) {
      toast.error(`Wallet creation failed: ${errorMsg}`);
    }

    return { success: false, error: errorMsg };
  } finally {
    setLoading(false);
  }
};

// Convenience methods for specific use cases
export const createInvisibleWallet = async (
  dbResult: DbResult,
  createWalletAsync: any,
  setLoading: (loading: boolean) => void,
  setError: (error: string | null) => void,
  network: "testnet" | "mainnet" = "testnet"
): Promise<WalletCreationResult> => {
  return createWalletWithMerchantUpdate(
    dbResult,
    createWalletAsync,
    setLoading,
    setError,
    { network },
    {
      autoGenerateKey: true,
      enableLocalStorage: true,
      showSuccessToast: true,
      showErrorToast: true,
      updateMerchantRecord: true,
    }
  );
};

export const createWalletWithPin = async (
  dbResult: DbResult,
  createWalletAsync: any,
  setLoading: (loading: boolean) => void,
  setError: (error: string | null) => void,
  pin: string,
  network: "testnet" | "mainnet" = "testnet",
  encryptionSalt?: string
): Promise<WalletCreationResult> => {
  return createWalletWithMerchantUpdate(
    dbResult,
    createWalletAsync,
    setLoading,
    setError,
    { pin, network, encryptionSalt },
    {
      autoGenerateKey: false,
      enableLocalStorage: true,
      showSuccessToast: true,
      showErrorToast: true,
      updateMerchantRecord: true,
    }
  );
};

export const createWalletWithCustomKey = async (
  dbResult: DbResult,
  createWalletAsync: any,
  setLoading: (loading: boolean) => void,
  setError: (error: string | null) => void,
  encryptKey: string,
  network: "testnet" | "mainnet" = "testnet"
): Promise<WalletCreationResult> => {
  return createWalletWithMerchantUpdate(
    dbResult,
    createWalletAsync,
    setLoading,
    setError,
    { encryptKey, network },
    {
      autoGenerateKey: false,
      enableLocalStorage: true,
      showSuccessToast: true,
      showErrorToast: true,
      updateMerchantRecord: true,
    }
  );
};

// Utility function to retrieve stored encryption key
export const getStoredEncryptionKey = (
  merchantId: string,
  network: "testnet" | "mainnet" = "testnet"
): string | null => {
  const storageKey = `encryptKey_${merchantId}_${network}`;
  return safeLocalStorageGet(storageKey);
};

// Utility function to clear stored encryption key
export const clearStoredEncryptionKey = (
  merchantId: string,
  network: "testnet" | "mainnet" = "testnet"
): boolean => {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const storageKey = `encryptKey_${merchantId}_${network}`;
      localStorage.removeItem(storageKey);
      return true;
    }
    return false;
  } catch (error) {
    console.warn("Failed to clear stored encryption key:", error);
    return false;
  }
};
