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

function normalizeAddress(value: string): string {
  try {
    return `0x${BigInt(value).toString(16)}`.toLowerCase();
  } catch {
    return value.trim().toLowerCase();
  }
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
  const { cavos, execute, walletStatus, address } = useCavos();

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
  const walletAddress = useMemo(() => cavos.getAddress() ?? address ?? null, [cavos, address]);

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

  const formatError = (error: unknown) => {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === "string") {
      return error;
    }
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
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
    if (!walletAddress || typeof window === "undefined") {
      return;
    }
    window.localStorage.removeItem(buildStorageKey(walletAddress));
  }, [walletAddress]);

  useEffect(() => {
    if (!walletAddress) {
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

    const raw = window.localStorage.getItem(buildStorageKey(walletAddress));
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
        message: "Local keys loaded. Register or update them on-chain.",
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
  }, [walletAddress, updateSyncState]);

  const generateKeys = () => {
    if (!walletAddress) {
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
    saveLocalKeys(nextSpendingPrivKey, nextViewingPrivKey, walletAddress);
    updateSyncState({
      status: "unsynced",
      message: "New local keys generated. Register them on-chain before scanning.",
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
      message: "Local keys removed. Generate and register fresh keys.",
    });
  };

  const registerKeys = async () => {
    if (
      !keys ||
      !spendingPrivKey ||
      !viewingPrivKey ||
      !walletStatus.isReady ||
      !walletAddress
    ) {
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
      message: "Registering keys on-chain...",
    });
    setRegistrationLogs([]);
    setLastTxHash("");

    const contextAddress = address;
    const cavosAddress = cavos.getAddress();
    const signerAddress = cavosAddress ?? contextAddress;
    if (!signerAddress) {
      updateSyncState({
        status: "error",
        message: "Missing signer address. Reconnect wallet and try again.",
      });
      return;
    }

    const normalizedContextAddress = contextAddress
      ? normalizeAddress(contextAddress)
      : null;
    const normalizedCavosAddress = cavosAddress ? normalizeAddress(cavosAddress) : null;
    const normalizedSignerAddress = normalizeAddress(signerAddress);

    console.group("[MetaAddressTab][register] Starting write flow");
    console.log("[MetaAddressTab][register] useCavos address:", contextAddress);
    console.log("[MetaAddressTab][register] cavos.getAddress():", cavosAddress);
    console.log("[MetaAddressTab][register] normalized useCavos address:", normalizedContextAddress);
    console.log("[MetaAddressTab][register] normalized cavos address:", normalizedCavosAddress);
    console.log("[MetaAddressTab][register] signer address:", signerAddress);
    console.log(
      "[MetaAddressTab][register] normalized signer address:",
      normalizedSignerAddress,
    );
    console.log("[MetaAddressTab][register] registry address:", SEPOLIA_CONFIG.registryAddress);
    console.log("[MetaAddressTab][register] configured chain id:", String(SEPOLIA_CONFIG.chainId));
    console.log("[MetaAddressTab][register] rpc url:", SEPOLIA_CONFIG.rpcUrl);
    console.log("[MetaAddressTab][register] calldata:", calldata);
    if (
      normalizedContextAddress &&
      normalizedCavosAddress &&
      normalizedContextAddress !== normalizedCavosAddress
    ) {
      const mismatchMessage =
        "Address mismatch detected between useCavos.address and cavos.getAddress(). Aborting write.";
      console.error("[MetaAddressTab][register]", mismatchMessage);
      appendRegistrationLog(mismatchMessage);
      updateSyncState({
        status: "error",
        message: mismatchMessage,
      });
      console.groupEnd();
      return;
    }
    appendRegistrationLog("Checking current on-chain registration status.");

    try {
      const hasResult = await provider.callContract({
        contractAddress: SEPOLIA_CONFIG.registryAddress,
        entrypoint: "has_meta_address",
        calldata: [signerAddress],
      });
      const hasMeta = BigInt(hasResult[0] ?? "0") !== 0n;
      console.log("[MetaAddressTab][register] has_meta_address raw:", hasResult);
      console.log("[MetaAddressTab][register] has_meta_address parsed:", hasMeta);

      let txHash: string;
      if (hasMeta) {
        appendRegistrationLog(
          `Meta-address exists for ${signerAddress.slice(0, 10)}... Updating.`,
        );
        try {
          console.log(
            "[MetaAddressTab][register] executing entrypoint:",
            "update_stealth_meta_address",
          );
          txHash = String(
            await execute({
              contractAddress: SEPOLIA_CONFIG.registryAddress,
              entrypoint: "update_stealth_meta_address",
              calldata,
            }),
          );
          console.log("[MetaAddressTab][register] update tx hash:", txHash);
          appendRegistrationLog(
            `update_stealth_meta_address submitted: ${shortenHash(txHash)}. Waiting confirmation.`,
          );
        } catch (error) {
          const updateErrorMessage = formatError(error);
          console.error("[MetaAddressTab][register] update failed:", updateErrorMessage);
          appendRegistrationLog(`Update failed: ${updateErrorMessage}`);
          throw error;
        }
      } else {
        appendRegistrationLog(
          `No meta-address found for ${signerAddress.slice(0, 10)}... Registering.`,
        );
        try {
          console.log(
            "[MetaAddressTab][register] executing entrypoint:",
            "register_stealth_meta_address",
          );
          txHash = String(
            await execute({
              contractAddress: SEPOLIA_CONFIG.registryAddress,
              entrypoint: "register_stealth_meta_address",
              calldata,
            }),
          );
          console.log("[MetaAddressTab][register] register tx hash:", txHash);
          appendRegistrationLog(
            `register_stealth_meta_address submitted: ${shortenHash(txHash)}. Waiting confirmation.`,
          );
        } catch (error) {
          const registerErrorMessage = formatError(error);
          console.error("[MetaAddressTab][register] register failed:", registerErrorMessage);
          const shouldFallbackToUpdate = registerErrorMessage
            .toLowerCase()
            .includes("already registered");
          if (!shouldFallbackToUpdate) {
            appendRegistrationLog(`Register failed: ${registerErrorMessage}`);
            throw error;
          }
          appendRegistrationLog(
            "Register returned already-registered. Retrying with update_stealth_meta_address.",
          );
          try {
            console.log(
              "[MetaAddressTab][register] executing entrypoint:",
              "update_stealth_meta_address",
            );
            txHash = String(
              await execute({
                contractAddress: SEPOLIA_CONFIG.registryAddress,
                entrypoint: "update_stealth_meta_address",
                calldata,
              }),
            );
            console.log(
              "[MetaAddressTab][register] update tx hash (after register fallback):",
              txHash,
            );
            appendRegistrationLog(
              `update_stealth_meta_address submitted: ${shortenHash(txHash)}. Waiting confirmation.`,
            );
          } catch (updateError) {
            const updateErrorMessage = formatError(updateError);
            console.error(
              "[MetaAddressTab][register] update failed after register fallback:",
              updateErrorMessage,
            );
            appendRegistrationLog(`Update failed: ${updateErrorMessage}`);
            throw updateError;
          }
        }
      }

      setLastTxHash(txHash);
      console.log("[MetaAddressTab][register] waiting for confirmation:", txHash);
      await provider.waitForTransaction(txHash);
      console.log("[MetaAddressTab][register] transaction confirmed:", txHash);
      appendRegistrationLog("Transaction confirmed.");
      saveLocalKeys(spendingPrivKey, viewingPrivKey, signerAddress);
      updateSyncState({
        status: "synced",
        message: "Keys registered on-chain.",
      });
      appendRegistrationLog("Done.");
      console.groupEnd();
    } catch (error) {
      console.error("[MetaAddressTab][register] flow failed:", formatError(error));
      appendRegistrationLog("Registration flow failed.");
      updateSyncState({
        status: "error",
        message:
          error instanceof Error
            ? `Failed to register keys on-chain: ${error.message}`
            : "Failed to register keys on-chain.",
      });
      console.groupEnd();
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Generate your keys and register them on-chain</CardTitle>
          <CardDescription>
            Generate local keys, register them on-chain, and fallback to update if
            already registered.
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
                  {walletAddress ?? "Connect wallet to show address"}
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
                    ? "Registering..."
                    : "Register Keys On-Chain"}
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
