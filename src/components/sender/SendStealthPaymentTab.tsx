"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SEPOLIA_CONFIG, STRK_TOKEN_ADDRESS } from "@/constants";
import { useCavos } from "@cavos/react";
import { poseidonHashMany } from "@scure/starknet";
import { RpcProvider } from "starknet";
import {
  decodeMetaAddress,
  generateStealthAddress,
} from "../../../starknet-stealth-addresses/sdk/src/stealth";
import type {
  StealthAddressResult,
  StealthMetaAddress,
} from "../../../starknet-stealth-addresses/sdk/src/types";

type MetaAddressData = {
  schemeId: number;
  spendingKey: { x: string; y: string };
  viewingKey: { x: string; y: string };
};

type FailedStep = "deploy" | "announce" | "fund" | null;

const STRK_DECIMALS = BigInt("1000000000000000000");
const U128_MASK = (BigInt(1) << BigInt(128)) - BigInt(1);

function parseStrkToWei(value: string): bigint {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error("Invalid STRK amount");
  }

  const [wholePart, fractionPart = ""] = trimmed.split(".");
  const normalizedFraction = (fractionPart + "0".repeat(18)).slice(0, 18);
  const whole = BigInt(wholePart || "0") * STRK_DECIMALS;
  const fraction = BigInt(normalizedFraction || "0");
  return whole + fraction;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isMempoolEvictionError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("evicted from the mempool") ||
    normalized.includes("transaction ttl") ||
    normalized.includes("increase the tip")
  );
}

export function SendStealthPaymentTab() {
  const [recipientAddress, setRecipientAddress] = useState("");
  const [amount, setAmount] = useState("0.01");
  const [isDeploying, setIsDeploying] = useState(false);
  const [isAnnouncing, setIsAnnouncing] = useState(false);
  const [isFunding, setIsFunding] = useState(false);
  const [hasDeployed, setHasDeployed] = useState(false);
  const [hasAnnounced, setHasAnnounced] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [isStatusError, setIsStatusError] = useState(false);
  const [failedStep, setFailedStep] = useState<FailedStep>(null);
  const [deployTxHash, setDeployTxHash] = useState("");
  const [announceTxHash, setAnnounceTxHash] = useState("");
  const [fundTxHash, setFundTxHash] = useState("");
  const [metaAddress, setMetaAddress] = useState<MetaAddressData | null>(null);
  const [stealthAddress, setStealthAddress] =
    useState<StealthAddressResult | null>(null);
  const [step, setStep] = useState<"initial" | "fetched" | "generated">(
    "initial",
  );
  const provider = new RpcProvider({ nodeUrl: SEPOLIA_CONFIG.rpcUrl });
  const { execute } = useCavos();

  const resetExecutionState = () => {
    setIsDeploying(false);
    setIsAnnouncing(false);
    setIsFunding(false);
    setHasDeployed(false);
    setHasAnnounced(false);
    setFailedStep(null);
    setStatusMessage("");
    setIsStatusError(false);
    setDeployTxHash("");
    setAnnounceTxHash("");
    setFundTxHash("");
  };

  const waitForReceiptFallback = async (txHash: string) => {
    const maxAttempts = 20;
    const delayMs = 2000;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        const receipt = await provider.getTransactionReceipt(txHash);
        const finalityStatus =
          "finality_status" in receipt ? receipt.finality_status : undefined;
        const executionStatus =
          "execution_status" in receipt ? receipt.execution_status : undefined;
        const status = "status" in receipt ? receipt.status : undefined;

        if (
          finalityStatus === "ACCEPTED_ON_L2" ||
          finalityStatus === "ACCEPTED_ON_L1"
        ) {
          if (executionStatus && executionStatus !== "SUCCEEDED") {
            throw new Error(
              `Transaction ${String(executionStatus).toLowerCase()}`,
            );
          }
          return;
        }

        if (status === "REJECTED") {
          throw new Error("Transaction rejected");
        }
      } catch (error) {
        if (attempt === maxAttempts - 1) {
          throw error;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    throw new Error("Transaction confirmation timed out");
  };

  const waitForConfirmation = async (txHash: string) => {
    try {
      await provider.waitForTransaction(txHash);
    } catch (primaryError) {
      try {
        await waitForReceiptFallback(txHash);
      } catch {
        throw primaryError;
      }
    }
  };

  const executeWithRetryOnce = async (
    stepLabel: string,
    txFn: () => Promise<string>,
  ): Promise<string> => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const txHash = await txFn();
        await waitForConfirmation(txHash);
        return txHash;
      } catch (error) {
        const message = getErrorMessage(error);
        if (attempt === 0 && isMempoolEvictionError(message)) {
          setIsStatusError(false);
          setStatusMessage(
            `${stepLabel} was evicted from mempool. Retrying once...`,
          );
          continue;
        }
        throw error;
      }
    }

    throw new Error(`${stepLabel} failed after retry.`);
  };

  const isContractAlreadyDeployed = async (address: string) => {
    try {
      await provider.getClassHashAt(address);
      return true;
    } catch {
      return false;
    }
  };

  const handleFetchMeta = async () => {
    if (!recipientAddress) return;

    try {
      const result = await provider.callContract({
        contractAddress: SEPOLIA_CONFIG.registryAddress,
        entrypoint: "get_stealth_meta_address",
        calldata: [recipientAddress],
      });

      const schemeId = Number(result[0] ?? "0");
      const spendingX = result[1] ?? "0";
      const spendingY = result[2] ?? "0";
      const viewingX = result[3] ?? "0";
      const viewingY = result[4] ?? "0";

      const hasMeta =
        BigInt(spendingX) !== 0n ||
        BigInt(spendingY) !== 0n ||
        BigInt(viewingX) !== 0n ||
        BigInt(viewingY) !== 0n;

      if (!hasMeta) {
        throw new Error(
          "Recipient has no registered meta-address. Ask recipient to sync keys on-chain first.",
        );
      }

      const decoded = decodeMetaAddress(
        spendingX,
        spendingY,
        viewingX,
        viewingY,
        schemeId,
      );
      setMetaAddress({
        schemeId: decoded.schemeId,
        spendingKey: {
          x: decoded.spendingKey.x.toString(),
          y: decoded.spendingKey.y.toString(),
        },
        viewingKey: {
          x: decoded.viewingKey.x.toString(),
          y: decoded.viewingKey.y.toString(),
        },
      });
      resetExecutionState();
      setIsStatusError(false);
      setStatusMessage("Meta-address fetched from registry.");
      setStep("fetched");
    } catch (error) {
      setMetaAddress(null);
      setStealthAddress(null);
      setStep("initial");
      setIsStatusError(true);
      setStatusMessage(`Meta lookup failed: ${getErrorMessage(error)}`);
    }
  };

  const handleGenerate = () => {
    if (!metaAddress) return;

    const parsedMetaAddress: StealthMetaAddress = {
      schemeId: metaAddress.schemeId,
      spendingKey: {
        x: BigInt(metaAddress.spendingKey.x),
        y: BigInt(metaAddress.spendingKey.y),
      },
      viewingKey: {
        x: BigInt(metaAddress.viewingKey.x),
        y: BigInt(metaAddress.viewingKey.y),
      },
    };

    const result = generateStealthAddress(
      parsedMetaAddress,
      SEPOLIA_CONFIG.factoryAddress,
      SEPOLIA_CONFIG.accountClassHash,
    );

    setStealthAddress(result);
    resetExecutionState();
    setStep("generated");
  };

  const handleDeployStealthAddress = async () => {
    if (!stealthAddress || isDeploying || isAnnouncing || isFunding) return;

    setIsDeploying(true);
    setFailedStep(null);
    try {
      const salt = poseidonHashMany([
        stealthAddress.ephemeralPubkey.x,
        stealthAddress.ephemeralPubkey.y,
      ]);
      const alreadyDeployed = await isContractAlreadyDeployed(
        stealthAddress.stealthAddress,
      );

      if (alreadyDeployed) {
        setHasDeployed(true);
        setIsStatusError(false);
        setStatusMessage("Stealth account already deployed.");
        return;
      }

      setIsStatusError(false);
      setStatusMessage("Deploying stealth account...");
      const txHash = await executeWithRetryOnce(
        "Deploy transaction",
        async () =>
          String(
            await execute(
              {
                contractAddress: SEPOLIA_CONFIG.factoryAddress,
                entrypoint: "deploy_stealth_account",
                calldata: [
                  stealthAddress.stealthPubkey.x.toString(),
                  stealthAddress.stealthPubkey.y.toString(),
                  salt.toString(),
                ],
              },
              { gasless: false },
            ),
          ),
      );
      setDeployTxHash(txHash);

      const deployedAfterTx = await isContractAlreadyDeployed(
        stealthAddress.stealthAddress,
      );
      if (!deployedAfterTx) {
        throw new Error(
          "Deployment tx confirmed but stealth account is still not deployed.",
        );
      }

      setHasDeployed(true);
      setStatusMessage("Deployment confirmed.");
    } catch (error) {
      setFailedStep("deploy");
      setIsStatusError(true);
      setStatusMessage(`Deploy failed: ${getErrorMessage(error)}`);
    } finally {
      setIsDeploying(false);
    }
  };

  const handleAnnouncePayment = async () => {
    if (
      !stealthAddress ||
      !hasDeployed ||
      isDeploying ||
      isAnnouncing ||
      isFunding
    ) {
      return;
    }

    setIsAnnouncing(true);
    setFailedStep(null);
    try {
      const schemeId = metaAddress?.schemeId ?? 0;
      setIsStatusError(false);
      setStatusMessage("Publishing announcement...");
      const txHash = await executeWithRetryOnce(
        "Announcement transaction",
        async () =>
          String(
            await execute(
              {
                contractAddress: SEPOLIA_CONFIG.registryAddress,
                entrypoint: "announce",
                calldata: [
                  schemeId.toString(),
                  stealthAddress.ephemeralPubkey.x.toString(),
                  stealthAddress.ephemeralPubkey.y.toString(),
                  stealthAddress.stealthAddress,
                  stealthAddress.viewTag.toString(),
                  "0",
                ],
              },
              { gasless: false },
            ),
          ),
      );
      setAnnounceTxHash(txHash);
      setHasAnnounced(true);
      setStatusMessage(
        "Announcement confirmed. You can fund the stealth address.",
      );
    } catch (error) {
      setFailedStep("announce");
      setIsStatusError(true);
      setStatusMessage(`Announce failed: ${getErrorMessage(error)}`);
    } finally {
      setIsAnnouncing(false);
    }
  };

  const handleSendFunds = async () => {
    if (
      !stealthAddress ||
      !hasAnnounced ||
      isDeploying ||
      isAnnouncing ||
      isFunding
    ) {
      return;
    }

    setIsFunding(true);
    setFailedStep(null);
    try {
      const amountWei = parseStrkToWei(amount);
      const amountLow = (amountWei & U128_MASK).toString();
      const amountHigh = (amountWei >> BigInt(128)).toString();

      setIsStatusError(false);
      setStatusMessage("Sending STRK to stealth address...");
      const txHash = await executeWithRetryOnce(
        "Funding transaction",
        async () =>
          String(
            await execute(
              {
                contractAddress: STRK_TOKEN_ADDRESS,
                entrypoint: "transfer",
                calldata: [
                  stealthAddress.stealthAddress,
                  amountLow,
                  amountHigh,
                ],
              },
              { gasless: false },
            ),
          ),
      );
      setFundTxHash(txHash);
      setStatusMessage("Funding confirmed.");
    } catch (error) {
      setFailedStep("fund");
      setIsStatusError(true);
      setStatusMessage(`Funding failed: ${getErrorMessage(error)}`);
    } finally {
      setIsFunding(false);
    }
  };

  const handleRetryFailedStep = async () => {
    if (failedStep === "deploy") {
      await handleDeployStealthAddress();
      return;
    }
    if (failedStep === "announce") {
      await handleAnnouncePayment();
      return;
    }
    if (failedStep === "fund") {
      await handleSendFunds();
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>SEND STEALTH PAYMENTS</CardTitle>
          <CardDescription>
            Enter a recipient&apos;s normal wallet address to securely derive a
            one-time stealth destination.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <Label htmlFor="recipient">Recipient Normal Address</Label>
            <div className="flex gap-2">
              <Input
                id="recipient"
                placeholder="0x..."
                value={recipientAddress}
                onChange={(e) => {
                  setRecipientAddress(e.target.value);
                  setStep("initial");
                  setMetaAddress(null);
                  setStealthAddress(null);
                  resetExecutionState();
                }}
              />
              <Button onClick={handleFetchMeta} disabled={!recipientAddress}>
                Fetch Recipient Meta
              </Button>
            </div>
          </div>

          {step === "fetched" && (
            <div className="flex flex-col gap-4 rounded-md border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
              <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                ✓ Meta address found on registry
              </p>
              {metaAddress ? (
                <div className="space-y-3 rounded-md border border-emerald-300/50 bg-emerald-50/40 p-3 dark:border-emerald-700/40 dark:bg-emerald-950/20">
                  <div className="text-xs text-zinc-600 dark:text-zinc-300">
                    Scheme ID:{" "}
                    <span className="font-mono">{metaAddress.schemeId}</span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded border bg-white p-2 dark:bg-zinc-950">
                      <div className="mb-1 text-xs font-medium">
                        Spending Key
                      </div>
                      <pre className="overflow-x-auto text-xs">
                        {`x: ${metaAddress.spendingKey.x}
y: ${metaAddress.spendingKey.y}`}
                      </pre>
                    </div>
                    <div className="rounded border bg-white p-2 dark:bg-zinc-950">
                      <div className="mb-1 text-xs font-medium">
                        Viewing Key
                      </div>
                      <pre className="overflow-x-auto text-xs">
                        {`x: ${metaAddress.viewingKey.x}
y: ${metaAddress.viewingKey.y}`}
                      </pre>
                    </div>
                  </div>
                </div>
              ) : null}
              <Button
                onClick={handleGenerate}
                variant="secondary"
                className="w-fit"
              >
                Generate Stealth Address
              </Button>
            </div>
          )}

          {step === "generated" && (
            <div className="flex flex-col gap-6 rounded-md border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-zinc-500">
                  Generated Stealth Destination:
                </span>
                <span className="font-mono text-sm text-zinc-900 dark:text-zinc-50">
                  {stealthAddress?.stealthAddress ?? ""}
                </span>
              </div>

              <div className="flex flex-col gap-3">
                <Button
                  size="lg"
                  onClick={handleDeployStealthAddress}
                  disabled={isDeploying || isAnnouncing || isFunding}
                  className="w-full sm:w-auto"
                >
                  {isDeploying
                    ? "Deploying..."
                    : "1) Deploy Recipient's Stealth Address"}
                </Button>
                <Button
                  size="lg"
                  variant="secondary"
                  onClick={handleAnnouncePayment}
                  disabled={
                    !hasDeployed ||
                    hasAnnounced ||
                    isDeploying ||
                    isAnnouncing ||
                    isFunding
                  }
                  className="w-full sm:w-auto"
                >
                  {isAnnouncing
                    ? "Announcing..."
                    : "2) Announce Payment On Registry"}
                </Button>
                {hasAnnounced ? (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="fundAmount">Amount to Fund (STRK)</Label>
                    <Input
                      id="fundAmount"
                      placeholder="0.01"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                  </div>
                ) : null}
                <Button
                  size="lg"
                  variant="secondary"
                  onClick={handleSendFunds}
                  disabled={
                    !hasAnnounced ||
                    !amount ||
                    isDeploying ||
                    isAnnouncing ||
                    isFunding
                  }
                  className="w-full sm:w-auto"
                >
                  {isFunding
                    ? "Sending Funds..."
                    : "3) Send Funds To Recipient's Stealth Address"}
                </Button>
                {failedStep ? (
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={handleRetryFailedStep}
                    disabled={isDeploying || isAnnouncing || isFunding}
                    className="w-full sm:w-auto"
                  >
                    Retry Failed Step ({failedStep})
                  </Button>
                ) : null}
              </div>

              {statusMessage ? (
                <p
                  className={`text-sm ${
                    isStatusError
                      ? "text-red-600 dark:text-red-400"
                      : "text-zinc-600 dark:text-zinc-300"
                  }`}
                >
                  {statusMessage}
                </p>
              ) : null}

              <div className="grid gap-2 text-xs">
                {deployTxHash ? (
                  <a
                    href={`https://sepolia.starkscan.co/tx/${deployTxHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono underline"
                  >
                    Deploy TX: {deployTxHash}
                  </a>
                ) : null}
                {announceTxHash ? (
                  <a
                    href={`https://sepolia.starkscan.co/tx/${announceTxHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono underline"
                  >
                    Announce TX: {announceTxHash}
                  </a>
                ) : null}
                {fundTxHash ? (
                  <a
                    href={`https://sepolia.starkscan.co/tx/${fundTxHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono underline"
                  >
                    Fund TX: {fundTxHash}
                  </a>
                ) : null}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
