"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useCavos } from "@cavos/react";
import { RpcProvider } from "starknet";
import { StealthScanner } from "../../../starknet-stealth-addresses/sdk/src/scanner";
import {
  createMetaAddress,
  encodeMetaAddress,
  getPublicKey,
} from "../../../starknet-stealth-addresses/sdk/src/stealth";
import type { ScanResult } from "../../../starknet-stealth-addresses/sdk/src/types";
import { SEPOLIA_CONFIG } from "@/constants";
import { STEALTH_REGISTRY_ABI } from "@/abi/registry";

type ScanStatus = "idle" | "scanning" | "error" | "success";

interface ScannerStats {
  totalAnnouncements: number;
  viewTagMatches: number;
  confirmedMatches: number;
  scanTimeMs: number;
}

const INITIAL_STATS: ScannerStats = {
  totalAnnouncements: 0,
  viewTagMatches: 0,
  confirmedMatches: 0,
  scanTimeMs: 0,
};

export function ScanAndClaimTab() {
  const { address } = useCavos();
  const [spendingPrivateKey, setSpendingPrivateKey] = useState("");
  const [viewingPrivateKey, setViewingPrivateKey] = useState("");
  const [fromBlock, setFromBlock] = useState("");
  const [status, setStatus] = useState<ScanStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [results, setResults] = useState<ScanResult[]>([]);
  const [stats, setStats] = useState<ScannerStats>(INITIAL_STATS);
  const [isScannerReady, setIsScannerReady] = useState(false);
  const [isValidatingKeys, setIsValidatingKeys] = useState(false);
  const [validationMessage, setValidationMessage] = useState("");
  const [validationError, setValidationError] = useState(false);

  const scanner = useMemo(
    () =>
      new StealthScanner({
        registryAddress: SEPOLIA_CONFIG.registryAddress,
        factoryAddress: SEPOLIA_CONFIG.factoryAddress,
        rpcUrl: SEPOLIA_CONFIG.rpcUrl,
        chainId: SEPOLIA_CONFIG.chainId,
      }),
    [],
  );
  const validationProvider = useMemo(
    () => new RpcProvider({ nodeUrl: SEPOLIA_CONFIG.rpcUrl }),
    [],
  );

  useEffect(() => {
    let isMounted = true;

    const initializeScanner = async () => {
      await scanner.initialize(
        STEALTH_REGISTRY_ABI,
        SEPOLIA_CONFIG.accountClassHash,
      );
      if (isMounted) {
        setIsScannerReady(true);
      }
    };

    initializeScanner().catch((error) => {
      if (isMounted) {
        setStatus("error");
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Failed to initialize scanner",
        );
      }
    });

    return () => {
      isMounted = false;
    };
  }, [scanner]);

  const derivedMetaAddress = useMemo(() => {
    if (!spendingPrivateKey || !viewingPrivateKey) {
      return null;
    }
    try {
      const spendingPrivKey = BigInt(spendingPrivateKey);
      const viewingPrivKey = BigInt(viewingPrivateKey);
      const metaAddress = createMetaAddress(spendingPrivKey, viewingPrivKey);
      const encoded = encodeMetaAddress(metaAddress);
      return {
        schemeId: encoded.schemeId.toString(),
        spendingX: encoded.spendingX,
        spendingY: encoded.spendingY,
        viewingX: encoded.viewingX,
        viewingY: encoded.viewingY,
      };
    } catch {
      return null;
    }
  }, [spendingPrivateKey, viewingPrivateKey]);

  const handleValidateKeys = async () => {
    if (!spendingPrivateKey || !viewingPrivateKey || !address) {
      setValidationError(true);
      setValidationMessage(
        "Connect your wallet and enter spending/viewing private keys first.",
      );
      return;
    }

    setIsValidatingKeys(true);
    setValidationError(false);
    setValidationMessage("Validating keys against on-chain meta-address...");
    try {
      const spendingPrivKey = BigInt(spendingPrivateKey);
      const viewingPrivKey = BigInt(viewingPrivateKey);
      const spendingPub = getPublicKey(spendingPrivKey);
      const viewingPub = getPublicKey(viewingPrivKey);

      const result = await validationProvider.callContract({
        contractAddress: SEPOLIA_CONFIG.registryAddress,
        entrypoint: "get_stealth_meta_address",
        calldata: [address],
      });

      const spendingX = BigInt(result[1] ?? "0");
      const spendingY = BigInt(result[2] ?? "0");
      const viewingX = BigInt(result[3] ?? "0");
      const viewingY = BigInt(result[4] ?? "0");

      if (spendingX === 0n || spendingY === 0n) {
        setValidationError(true);
        setValidationMessage(
          "No meta-address registered for this address on-chain.",
        );
        return;
      }

      const spendingMatches =
        spendingPub.x === spendingX && spendingPub.y === spendingY;
      const viewingMatches = viewingPub.x === viewingX && viewingPub.y === viewingY;

      if (spendingMatches && viewingMatches) {
        setValidationError(false);
        setValidationMessage(
          "Keys match on-chain meta-address. Scan should be able to find matching announcements.",
        );
        return;
      }

      const mismatches: string[] = [];
      if (!spendingMatches) mismatches.push("spending key");
      if (!viewingMatches) mismatches.push("viewing key");
      setValidationError(true);
      setValidationMessage(
        `Mismatch detected for ${mismatches.join(" and ")} vs on-chain meta-address.`,
      );
    } catch (error) {
      setValidationError(true);
      setValidationMessage(
        error instanceof Error
          ? `Validation failed: ${error.message}`
          : "Validation failed.",
      );
    } finally {
      setIsValidatingKeys(false);
    }
  };

  const handleScan = async () => {
    if (!isScannerReady) {
      setStatus("error");
      setErrorMessage("Scanner is still initializing. Try again in a second.");
      return;
    }

    try {
      setStatus("scanning");
      setErrorMessage("");

      const spendingPrivKey = BigInt(spendingPrivateKey);
      const viewingPrivKey = BigInt(viewingPrivateKey);
      const spendingPubkey = getPublicKey(spendingPrivKey);
      const parsedFromBlock = fromBlock ? Number(fromBlock) : 0;
      const safeFromBlock = Number.isFinite(parsedFromBlock)
        ? parsedFromBlock
        : 0;

      const scanResults = await scanner.scan(
        spendingPubkey,
        viewingPrivKey,
        spendingPrivKey,
        safeFromBlock,
      );

      setResults(scanResults);
      setStats({ ...scanner.stats });
      setStatus("success");
    } catch (error) {
      setStatus("error");
      setResults([]);
      setStats(INITIAL_STATS);
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to scan announcements",
      );
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Card className="border-amber-500/50 bg-amber-500/5 dark:border-amber-500/20 dark:bg-amber-500/10">
        <CardHeader>
          <CardTitle className="text-amber-700 dark:text-amber-500">
            Scan Payments
          </CardTitle>
          <CardDescription className="text-amber-900/80 dark:text-amber-200/70">
            Use your spending and viewing private keys to detect stealth
            payments sent to you.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-200 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
              1
            </span>
            Enter Your Keys
          </CardTitle>
          <CardDescription>
            Keys generated in Meta-Address are auto-filled here. The meta-address
            preview below is computed from these private keys.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <Label htmlFor="spendingPrivateKey">Spending Private Key</Label>
            <Input
              id="spendingPrivateKey"
              type="password"
              placeholder="Spending key"
              value={spendingPrivateKey}
              onChange={(e) => {
                setSpendingPrivateKey(e.target.value);
                setStatus("idle");
                setErrorMessage("");
                setValidationMessage("");
                setValidationError(false);
              }}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Derived Meta-Address (from inserted private keys)</Label>
            <div className="rounded-md bg-zinc-950 p-4">
              <pre className="overflow-x-auto text-sm text-zinc-50">
                <code>
                  {derivedMetaAddress
                    ? JSON.stringify(derivedMetaAddress, null, 2)
                    : "Enter valid spending/viewing private keys to derive meta-address."}
                </code>
              </pre>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="viewingPrivateKey">Viewing Private Key</Label>
            <Input
              id="viewingPrivateKey"
              type="password"
              placeholder="Viewing key"
              value={viewingPrivateKey}
              onChange={(e) => {
                setViewingPrivateKey(e.target.value);
                setStatus("idle");
                setErrorMessage("");
                setValidationMessage("");
                setValidationError(false);
              }}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="fromBlock" className="text-zinc-500">
              From Block (optional, reduces scan time)
            </Label>
            <Input
              id="fromBlock"
              placeholder="e.g. 5621500"
              value={fromBlock}
              onChange={(e) => {
                setFromBlock(e.target.value);
                setStatus("idle");
                setErrorMessage("");
              }}
            />
          </div>

          <div className="flex flex-col gap-4">
            <Button
              onClick={handleValidateKeys}
              variant="outline"
              className="w-fit"
              disabled={
                !address ||
                !spendingPrivateKey ||
                !viewingPrivateKey ||
                isValidatingKeys
              }
            >
              {isValidatingKeys
                ? "Validating..."
                : "Validate Keys vs On-Chain Meta"}
            </Button>

            {validationMessage && (
              <div
                className={`rounded-md border p-3 text-sm ${
                  validationError
                    ? "border-red-200 bg-red-50 text-red-600 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400"
                    : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-400"
                }`}
              >
                {validationMessage}
              </div>
            )}

            <Button
              onClick={handleScan}
              className="w-fit bg-zinc-900 text-zinc-50 hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
              disabled={
                !spendingPrivateKey ||
                !viewingPrivateKey ||
                status === "scanning" ||
                !isScannerReady
              }
            >
              {status === "scanning" ? "Scanning..." : "Scan Announcements"}
            </Button>

            {status === "error" && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400">
                Scan failed: {errorMessage}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-200 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
              2
            </span>
            Results
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
              {stats.totalAnnouncements} announcements scanned
            </p>
            <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
              {stats.confirmedMatches} payments found
            </p>
            <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
              {stats.scanTimeMs}ms scan time
            </p>
            {status === "success" && (
              <p className="mt-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                {results.length > 0
                  ? "Stealth payments found."
                  : "No matching payments found."}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
