"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  createMetaAddress,
  encodeMetaAddress,
  generatePrivateKey,
} from "../../../starknet-stealth-addresses/sdk/src/stealth";
import { SEPOLIA_CONFIG } from "@/constants";
import { useCavos } from "@cavos/react";
import { RpcProvider } from "starknet";

type EncodedKeys = {
  spendingX: string;
  spendingY: string;
  viewingX: string;
  viewingY: string;
  schemeId: string;
};

interface StoredRecipientKeys {
  spendingPrivKey: string;
  viewingPrivKey: string;
  chainId: string;
  registryAddress: string;
  ownerAddress: string;
  updatedAt: string;
}

export interface GeneratedRecipientKeys {
  spendingPrivKey: bigint;
  viewingPrivKey: bigint;
}

export type RecipientKeySyncStatus =
  | "idle"
  | "unsynced"
  | "syncing"
  | "synced"
  | "mismatch"
  | "error";

export interface RecipientKeySyncState {
  status: RecipientKeySyncStatus;
  message: string;
}

interface MetaAddressTabProps {
  onKeysGenerated?: (keys: GeneratedRecipientKeys | null) => void;
  onSyncStateChange?: (state: RecipientKeySyncState) => void;
}

const STORAGE_PREFIX = "stealth-recipient-keys";

function buildStorageKey(address: string): string {
  return `${STORAGE_PREFIX}:${SEPOLIA_CONFIG.chainId}:${SEPOLIA_CONFIG.registryAddress.toLowerCase()}:${address.toLowerCase()}`;
}

function toEncodedKeys(
  spendingPrivKey: bigint,
  viewingPrivKey: bigint,
): EncodedKeys {
  const metaAddress = createMetaAddress(spendingPrivKey, viewingPrivKey);
  const encoded = encodeMetaAddress(metaAddress);
  return {
    spendingX: encoded.spendingX,
    spendingY: encoded.spendingY,
    viewingX: encoded.viewingX,
    viewingY: encoded.viewingY,
    schemeId: encoded.schemeId.toString(),
  };
}

export function MetaAddressTab({
  onKeysGenerated,
  onSyncStateChange,
}: MetaAddressTabProps) {
  const { execute, walletStatus, registerCurrentSession, address } = useCavos();

  const [spendingPrivKey, setSpendingPrivKey] = useState<bigint | null>(null);
  const [viewingPrivKey, setViewingPrivKey] = useState<bigint | null>(null);
  const [keys, setKeys] = useState<EncodedKeys | null>(null);
  const [registrationLogs, setRegistrationLogs] = useState<string[]>([]);
  const [lastTxHash, setLastTxHash] = useState<string>("");
  const [syncState, setSyncState] = useState<RecipientKeySyncState>({
    status: "idle",
    message: "Generate keys to start.",
  });

  const provider = useMemo(
    () => new RpcProvider({ nodeUrl: SEPOLIA_CONFIG.rpcUrl }),
    [],
  );

  const keysGenerated = Boolean(spendingPrivKey && viewingPrivKey && keys);

  const updateSyncState = useCallback(
    (next: RecipientKeySyncState) => {
      setSyncState(next);
      onSyncStateChange?.(next);
    },
    [onSyncStateChange],
  );

  useEffect(() => {
    if (!spendingPrivKey || !viewingPrivKey) {
      onKeysGenerated?.(null);
      return;
    }

    onKeysGenerated?.({ spendingPrivKey, viewingPrivKey });
  }, [onKeysGenerated, spendingPrivKey, viewingPrivKey]);

  const shortenHash = (value: string) =>
    value.length > 18 ? `${value.slice(0, 10)}...${value.slice(-6)}` : value;

  const appendRegistrationLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setRegistrationLogs((prev) => [...prev, `[${timestamp}] ${message}`]);
  };

  const saveLocalKeys = useCallback(
    (nextSpendingPrivKey: bigint, nextViewingPrivKey: bigint, ownerAddress: string) => {
      if (typeof window === "undefined") {
        return;
      }

      const payload: StoredRecipientKeys = {
        spendingPrivKey: nextSpendingPrivKey.toString(),
        viewingPrivKey: nextViewingPrivKey.toString(),
        chainId: String(SEPOLIA_CONFIG.chainId),
        registryAddress: SEPOLIA_CONFIG.registryAddress,
        ownerAddress,
        updatedAt: new Date().toISOString(),
      };

      window.localStorage.setItem(buildStorageKey(ownerAddress), JSON.stringify(payload));
    },
    [],
  );

  const clearLocalKeys = useCallback(() => {
    if (!address || typeof window === "undefined") {
      return;
    }
    window.localStorage.removeItem(buildStorageKey(address));
  }, [address]);

  const verifyKeysOnChain = useCallback(
    async (currentKeys: EncodedKeys, ownerAddress: string): Promise<boolean> => {
      const onchain = await provider.callContract({
        contractAddress: SEPOLIA_CONFIG.registryAddress,
        entrypoint: "get_stealth_meta_address",
        calldata: [ownerAddress],
      });

      return (
        String(onchain[1] ?? "0") === currentKeys.spendingX &&
        String(onchain[2] ?? "0") === currentKeys.spendingY &&
        String(onchain[3] ?? "0") === currentKeys.viewingX &&
        String(onchain[4] ?? "0") === currentKeys.viewingY &&
        String(onchain[0] ?? "0") === currentKeys.schemeId
      );
    },
    [provider],
  );

  const checkOnChainSyncStatus = useCallback(
    async (currentKeys: EncodedKeys, ownerAddress: string) => {
      try {
        const matches = await verifyKeysOnChain(currentKeys, ownerAddress);
        if (matches) {
          updateSyncState({
            status: "synced",
            message: "Keys synced and verified against on-chain meta-address.",
          });
          appendRegistrationLog("On-chain verification successful.");
          return;
        }

        updateSyncState({
          status: "mismatch",
          message:
            "On-chain keys differ from local keys. Sync keys on-chain before scanning.",
        });
        appendRegistrationLog("Detected local/on-chain key mismatch.");
      } catch (error) {
        updateSyncState({
          status: "error",
          message:
            error instanceof Error
              ? `Unable to verify on-chain keys: ${error.message}`
              : "Unable to verify on-chain keys.",
        });
      }
    },
    [updateSyncState, verifyKeysOnChain],
  );

  useEffect(() => {
    if (!address) {
      updateSyncState({
        status: "idle",
        message: "Connect wallet to manage recipient keys.",
      });
      setSpendingPrivKey(null);
      setViewingPrivKey(null);
      setKeys(null);
      setRegistrationLogs([]);
      setLastTxHash("");
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    const raw = window.localStorage.getItem(buildStorageKey(address));
    if (!raw) {
      updateSyncState({
        status: "unsynced",
        message: "No local keys found for this wallet. Generate new keys.",
      });
      setSpendingPrivKey(null);
      setViewingPrivKey(null);
      setKeys(null);
      return;
    }

    try {
      const parsed = JSON.parse(raw) as StoredRecipientKeys;
      const restoredSpendingPriv = BigInt(parsed.spendingPrivKey);
      const restoredViewingPriv = BigInt(parsed.viewingPrivKey);
      const restoredKeys = toEncodedKeys(restoredSpendingPriv, restoredViewingPriv);

      setSpendingPrivKey(restoredSpendingPriv);
      setViewingPrivKey(restoredViewingPriv);
      setKeys(restoredKeys);
      setRegistrationLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] Restored local keys from browser storage.`,
      ]);
      updateSyncState({
        status: "unsynced",
        message: "Local keys loaded. Verifying against on-chain meta-address...",
      });
      checkOnChainSyncStatus(restoredKeys, address).catch(() => {
        // handled in checkOnChainSyncStatus
      });
    } catch {
      updateSyncState({
        status: "error",
        message: "Failed to read stored keys. Generate new keys.",
      });
      setSpendingPrivKey(null);
      setViewingPrivKey(null);
      setKeys(null);
    }
  }, [address, checkOnChainSyncStatus, updateSyncState]);

  const generateKeys = () => {
    if (!address) {
      updateSyncState({
        status: "error",
        message: "Connect wallet before generating keys.",
      });
      return;
    }

    const nextSpendingPrivKey = generatePrivateKey();
    const nextViewingPrivKey = generatePrivateKey();
    const encodedKeys = toEncodedKeys(nextSpendingPrivKey, nextViewingPrivKey);

    setSpendingPrivKey(nextSpendingPrivKey);
    setViewingPrivKey(nextViewingPrivKey);
    setKeys(encodedKeys);
    setRegistrationLogs([]);
    setLastTxHash("");
    saveLocalKeys(nextSpendingPrivKey, nextViewingPrivKey, address);
    updateSyncState({
      status: "unsynced",
      message: "New local keys generated. Sync them on-chain before scanning.",
    });
  };

  const discardLocalKeys = () => {
    clearLocalKeys();
    setSpendingPrivKey(null);
    setViewingPrivKey(null);
    setKeys(null);
    setRegistrationLogs([]);
    setLastTxHash("");
    updateSyncState({
      status: "unsynced",
      message: "Local keys removed. Generate and sync fresh keys.",
    });
  };

  const registerKeys = async () => {
    if (!keys || !spendingPrivKey || !viewingPrivKey || !walletStatus.isReady || !address) {
      updateSyncState({
        status: "error",
        message: "Wallet not ready or local keys missing.",
      });
      return;
    }

    const calldata = [
      keys.spendingX,
      keys.spendingY,
      keys.viewingX,
      keys.viewingY,
      keys.schemeId,
    ];

    updateSyncState({
      status: "syncing",
      message: "Syncing keys on-chain...",
    });
    setRegistrationLogs([]);
    setLastTxHash("");
    appendRegistrationLog("Starting key sync to registry.");

    const needsSessionRecovery = (message: string) =>
      message.includes("Paymaster RPC error [156]") ||
      message.toLowerCase().includes("contract not found") ||
      message.includes("get_session");

    const executeWithSessionRecovery = async (entrypoint: string) => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const isRetry = attempt > 0;
          appendRegistrationLog(
            `${isRetry ? "Retrying" : "Submitting"} ${entrypoint} transaction.`,
          );
          const txHash = await execute({
            contractAddress: SEPOLIA_CONFIG.registryAddress,
            entrypoint,
            calldata,
          });
          appendRegistrationLog(`Transaction submitted: ${shortenHash(String(txHash))}.`);
          return String(txHash);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (!needsSessionRecovery(message) || attempt === 2) {
            throw error;
          }

          appendRegistrationLog(
            "Session issue detected. Registering current session before retry.",
          );
          const sessionTxHash = await registerCurrentSession();
          appendRegistrationLog(
            `Session registration submitted: ${shortenHash(String(sessionTxHash))}. Waiting confirmation...`,
          );
          await provider.waitForTransaction(String(sessionTxHash));
          appendRegistrationLog("Session registration confirmed.");
          await new Promise((resolve) => setTimeout(resolve, 1200));
        }
      }

      throw new Error("Unable to execute registry write after session recovery.");
    };

    const hasMetaAddressOnChain = async (ownerAddress: string): Promise<boolean> => {
      const result = await provider.callContract({
        contractAddress: SEPOLIA_CONFIG.registryAddress,
        entrypoint: "has_meta_address",
        calldata: [ownerAddress],
      });
      return BigInt(result[0] ?? "0") !== 0n;
    };

    try {
      const hasMetaBeforeWrite = await hasMetaAddressOnChain(address);
      const primaryEntrypoint = hasMetaBeforeWrite
        ? "update_stealth_meta_address"
        : "register_stealth_meta_address";
      const secondaryEntrypoint =
        primaryEntrypoint === "register_stealth_meta_address"
          ? "update_stealth_meta_address"
          : "register_stealth_meta_address";
      appendRegistrationLog(
        hasMetaBeforeWrite
          ? "Meta-address exists on-chain. Using update entrypoint."
          : "Meta-address not found on-chain. Using register entrypoint.",
      );

      let txHash = "";
      try {
        txHash = await executeWithSessionRecovery(primaryEntrypoint);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        appendRegistrationLog(
          `Primary entrypoint failed (${message}). Retrying with ${secondaryEntrypoint}.`,
        );
        txHash = await executeWithSessionRecovery(secondaryEntrypoint);
      }

      setLastTxHash(txHash);
      appendRegistrationLog("Waiting for transaction confirmation.");
      await provider.waitForTransaction(txHash);
      appendRegistrationLog("Transaction confirmed.");

      appendRegistrationLog("Verifying on-chain keys against local keys.");
      const matches = await verifyKeysOnChain(keys, address);
      if (!matches) {
        updateSyncState({
          status: "mismatch",
          message:
            "Transaction confirmed but on-chain keys still differ from local keys.",
        });
        appendRegistrationLog("Verification failed: local/on-chain mismatch remains.");
        return;
      }

      saveLocalKeys(spendingPrivKey, viewingPrivKey, address);
      updateSyncState({
        status: "synced",
        message: "Keys synced and verified on-chain.",
      });
      appendRegistrationLog("Verification successful. Keys synced on-chain.");
    } catch (error) {
      try {
        appendRegistrationLog(
          "Write flow failed. Checking if keys were already synced on-chain.",
        );
        const matches = await verifyKeysOnChain(keys, address);
        if (matches) {
          saveLocalKeys(spendingPrivKey, viewingPrivKey, address);
          updateSyncState({
            status: "synced",
            message: "Keys already synced on-chain.",
          });
          appendRegistrationLog("Verification successful. Keys were already synced.");
          return;
        }
      } catch {
        // Ignore follow-up verification errors and surface the write failure.
      }

      appendRegistrationLog("Unable to sync keys on-chain.");
      updateSyncState({
        status: "error",
        message:
          error instanceof Error
            ? `Failed to sync keys on-chain: ${error.message}`
            : "Failed to sync keys on-chain.",
      });
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Generate your keys and register them on-chain</CardTitle>
          <CardDescription>
            Mirror demo flow: generate local keys, then register/update and verify
            on-chain meta-address.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {!keysGenerated ? (
            <div className="flex justify-center py-8">
              <Button size="lg" onClick={generateKeys} disabled={!address}>
                Generate Keys
              </Button>
            </div>
          ) : (
            <>
              <div className="rounded-md bg-zinc-950 p-4">
                <pre className="overflow-x-auto text-sm text-zinc-50">
                  <code>{JSON.stringify(keys ?? {}, null, 2)}</code>
                </pre>
              </div>

              <div className="rounded-md border border-amber-500/50 bg-amber-500/5 p-4 dark:border-amber-500/20 dark:bg-amber-500/10">
                <h4 className="mb-2 text-sm font-semibold text-amber-900 dark:text-amber-500">
                  SAVE YOUR PRIVATE KEYS
                </h4>
                <p className="mb-3 text-xs text-amber-800 dark:text-amber-200/70">
                  Keep these secure. Scanning only works when these local keys
                  match your on-chain meta-address.
                </p>
                <div className="grid gap-3">
                  <div>
                    <p className="mb-1 text-xs font-semibold">Spending Key</p>
                    <div className="break-all rounded bg-white/50 px-3 py-2 font-mono text-xs text-amber-950 dark:bg-black/50 dark:text-amber-200">
                      {spendingPrivKey?.toString()}
                    </div>
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-semibold">Viewing Key</p>
                    <div className="break-all rounded bg-white/50 px-3 py-2 font-mono text-xs text-amber-950 dark:bg-black/50 dark:text-amber-200">
                      {viewingPrivKey?.toString()}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-md border p-4">
                <h4 className="mb-2 text-sm font-semibold">
                  Registry Lookup Address (share this with sender)
                </h4>
                <div className="break-all rounded bg-zinc-100 px-3 py-2 font-mono text-xs dark:bg-zinc-900">
                  {address ?? "Connect wallet to show address"}
                </div>
                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                  Sender fetches this address from registry to generate stealth
                  destination for each payment.
                </p>
              </div>

              <div className="rounded-md border p-4 text-sm">
                <p className="font-semibold">Sync Status</p>
                <p className="mt-1 text-zinc-700 dark:text-zinc-300">
                  {syncState.message}
                </p>
                <p className="mt-1 font-mono text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  {syncState.status}
                </p>
              </div>

              <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:justify-end">
                <Button variant="outline" onClick={generateKeys}>
                  Regenerate Keys
                </Button>
                <Button variant="outline" onClick={discardLocalKeys}>
                  Discard Local Keys
                </Button>
                <Button onClick={registerKeys} disabled={!keys || syncState.status === "syncing"}>
                  {syncState.status === "syncing"
                    ? "Syncing..."
                    : "Sync Keys On-Chain"}
                </Button>
              </div>

              {lastTxHash ? (
                <p className="text-sm text-zinc-600 dark:text-zinc-300">
                  Latest TX:{" "}
                  <a
                    className="underline"
                    href={`https://sepolia.starkscan.co/tx/${lastTxHash}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {shortenHash(lastTxHash)}
                  </a>
                </p>
              ) : null}

              {registrationLogs.length ? (
                <div className="rounded-md border p-4">
                  <h4 className="mb-2 text-sm font-semibold">Registration Timeline</h4>
                  <ul className="grid gap-1 text-xs text-zinc-700 dark:text-zinc-300">
                    {registrationLogs.map((log, index) => (
                      <li key={`${log}-${index}`} className="font-mono">
                        {log}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
