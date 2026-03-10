"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  computeStealthContractAddress,
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

export interface GeneratedRecipientKeys {
  spendingPrivKey: bigint;
  viewingPrivKey: bigint;
}

interface MetaAddressTabProps {
  onKeysGenerated?: (keys: GeneratedRecipientKeys) => void;
}

export function MetaAddressTab({ onKeysGenerated }: MetaAddressTabProps) {
  const { execute, walletStatus, registerCurrentSession, address } = useCavos();
  const [spendingPrivKey, setSpendingPrivKey] = useState<bigint>(0n);
  const [viewingPrivKey, setViewingPrivKey] = useState<bigint>(0n);
  const [keysGenerated, setKeysGenerated] = useState(false);
  const [registrationStatus, setRegistrationStatus] = useState<string>("");
  const [registrationLogs, setRegistrationLogs] = useState<string[]>([]);
  const [lastTxHash, setLastTxHash] = useState<string>("");
  const [accountAddress, setAccountAddress] = useState<string>("");
  const [keys, setKeys] = useState<EncodedKeys | null>(null);
  const provider = new RpcProvider({ nodeUrl: SEPOLIA_CONFIG.rpcUrl });

  const shortenHash = (value: string) =>
    value.length > 18 ? `${value.slice(0, 10)}...${value.slice(-6)}` : value;

  const appendRegistrationLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setRegistrationLogs((prev) => [...prev, `[${timestamp}] ${message}`]);
  };

  const generateKeys = () => {
    const spendingPrivKey = generatePrivateKey();
    setSpendingPrivKey(spendingPrivKey);
    const viewingPrivKey = generatePrivateKey();
    setViewingPrivKey(viewingPrivKey);
    setRegistrationStatus("");
    setRegistrationLogs([]);
    setLastTxHash("");
    setAccountAddress("");
    setKeys(null);
    setKeysGenerated(true);
  };

  const generateAndEncodeMetaAddress = () => {
    const metaAddress = createMetaAddress(spendingPrivKey, viewingPrivKey);
    const encoded = encodeMetaAddress(metaAddress);
    setKeys({
      spendingX: encoded.spendingX,
      spendingY: encoded.spendingY,
      viewingX: encoded.viewingX,
      viewingY: encoded.viewingY,
      schemeId: encoded.schemeId.toString(),
    });
    setAccountAddress(
      computeStealthContractAddress({
        classHash: SEPOLIA_CONFIG.accountClassHash,
        deployerAddress: SEPOLIA_CONFIG.factoryAddress,
        salt: spendingPrivKey,
        constructorCalldata: [
          BigInt(encoded.spendingX),
          BigInt(encoded.spendingY),
        ],
      }),
    );
    setKeysGenerated(true);
    console.log("Generated meta address: ", metaAddress);
  };

  const registerKeys = async () => {
    if (!keys || !walletStatus.isReady || !address) {
      setRegistrationStatus("Wallet not ready or meta-address not generated yet.");
      return;
    }

    const calldata = [
      keys.spendingX,
      keys.spendingY,
      keys.viewingX,
      keys.viewingY,
      keys.schemeId,
    ];

    setRegistrationStatus("");
    setRegistrationLogs([]);
    setLastTxHash("");
    appendRegistrationLog("Starting key sync to registry.");

    const executeWithSessionRecovery = async (entrypoint: string) => {
      try {
        appendRegistrationLog(`Submitting ${entrypoint} transaction.`);
        const txHash = await execute({
          contractAddress: SEPOLIA_CONFIG.registryAddress,
          entrypoint,
          calldata,
        });
        appendRegistrationLog(
          `Transaction submitted: ${shortenHash(String(txHash))}.`,
        );
        return String(txHash);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const needsSessionRecovery =
          message.includes("Paymaster RPC error [156]") ||
          message.toLowerCase().includes("contract not found") ||
          message.includes("get_session");

        if (!needsSessionRecovery) {
          throw error;
        }

        appendRegistrationLog(
          "Session issue detected. Registering current session and retrying.",
        );
        const sessionTxHash = await registerCurrentSession();
        appendRegistrationLog(
          `Session registered: ${shortenHash(String(sessionTxHash))}.`,
        );

        const retryTxHash = await execute({
          contractAddress: SEPOLIA_CONFIG.registryAddress,
          entrypoint,
          calldata,
        });
        appendRegistrationLog(
          `Retry submitted: ${shortenHash(String(retryTxHash))}.`,
        );
        return String(retryTxHash);
      }
    };

    const verifyKeysOnChain = async () => {
      const onchain = await provider.callContract({
        contractAddress: SEPOLIA_CONFIG.registryAddress,
        entrypoint: "get_stealth_meta_address",
        calldata: [address],
      });

      return (
        String(onchain[1] ?? "0") === keys.spendingX &&
        String(onchain[2] ?? "0") === keys.spendingY &&
        String(onchain[3] ?? "0") === keys.viewingX &&
        String(onchain[4] ?? "0") === keys.viewingY &&
        String(onchain[0] ?? "0") === keys.schemeId
      );
    };

    try {
      appendRegistrationLog("Checking if meta-address already exists on-chain.");
      const hasMeta = await provider.callContract({
        contractAddress: SEPOLIA_CONFIG.registryAddress,
        entrypoint: "has_meta_address",
        calldata: [address],
      });
      const exists = BigInt(hasMeta[0] ?? "0") !== 0n;
      const primaryEntrypoint = exists
        ? "update_stealth_meta_address"
        : "register_stealth_meta_address";
      const secondaryEntrypoint = exists
        ? "register_stealth_meta_address"
        : "update_stealth_meta_address";
      appendRegistrationLog(
        exists
          ? "Meta-address exists. Using update entrypoint."
          : "Meta-address not found. Using register entrypoint.",
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
      const matches = await verifyKeysOnChain();
      if (!matches) {
        throw new Error("On-chain keys do not match local generated keys.");
      }

      onKeysGenerated?.({ spendingPrivKey, viewingPrivKey });
      setRegistrationStatus("Keys synced on-chain.");
      appendRegistrationLog("Verification successful. Keys synced on-chain.");
      console.log("Keys synced on registry: ", keys);
      return;
    } catch (error) {
      try {
        appendRegistrationLog(
          "Write flow failed. Checking if keys were already synced on-chain.",
        );
        const matches = await verifyKeysOnChain();
        if (matches) {
          onKeysGenerated?.({ spendingPrivKey, viewingPrivKey });
          setRegistrationStatus("Keys already synced on-chain.");
          appendRegistrationLog(
            "Verification successful. Keys were already synced on-chain.",
          );
          console.log("Keys already synced on registry: ", keys);
          return;
        }
      } catch {
        // Ignore verification errors and surface the original write failure.
      }

      console.error("Failed to sync keys on-chain:", error);
      appendRegistrationLog("Unable to sync keys on-chain.");
      setRegistrationStatus(
        "Failed to write keys on-chain. Ensure wallet session is healthy and try again.",
      );
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Generate your keys and register them on-chain</CardTitle>
          <CardDescription>
            Create local spending and viewing keys to derive your stealth
            meta-address.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {!keysGenerated ? (
            <div className="flex justify-center py-8">
              <Button size="lg" onClick={generateKeys}>
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
                  SAVE YOUR PRIVATE KEYS!
                </h4>
                <p className="mb-3 text-xs text-amber-800 dark:text-amber-200/70">
                  You need both to scan and claim payments. They will not be
                  shown again.
                </p>
                <div className="grid gap-3">
                  <div>
                    <p className="mb-1 text-xs font-semibold">Spending Key</p>
                    <div className="break-all rounded bg-white/50 px-3 py-2 font-mono text-xs text-amber-950 dark:bg-black/50 dark:text-amber-200">
                      {spendingPrivKey.toString()}
                    </div>
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-semibold">Viewing Key</p>
                    <div className="break-all rounded bg-white/50 px-3 py-2 font-mono text-xs text-amber-950 dark:bg-black/50 dark:text-amber-200">
                      {viewingPrivKey.toString()}
                    </div>
                  </div>
                </div>
              </div>

              {accountAddress ? (
                <div className="rounded-md border p-4">
                  <h4 className="mb-2 text-sm font-semibold">
                    Account Address (preview)
                  </h4>
                  <div className="break-all rounded bg-zinc-100 px-3 py-2 font-mono text-xs dark:bg-zinc-900">
                    {accountAddress}
                  </div>
                </div>
              ) : null}

              <div className="flex flex-col gap-4 sm:flex-row sm:justify-end">
                <Button
                  variant="outline"
                  onClick={generateAndEncodeMetaAddress}
                >
                  Generate Meta-Address
                </Button>
                <Button onClick={registerKeys} disabled={!keys}>
                  Register Your Keys Onchain
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
              {registrationStatus ? (
                <p className="text-sm text-zinc-600 dark:text-zinc-300">
                  {registrationStatus}
                </p>
              ) : null}
              {registrationLogs.length ? (
                <div className="rounded-md border p-4">
                  <h4 className="mb-2 text-sm font-semibold">
                    Registration Timeline
                  </h4>
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
