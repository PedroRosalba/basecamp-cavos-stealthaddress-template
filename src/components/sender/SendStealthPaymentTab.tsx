"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SEPOLIA_CONFIG } from "@/constants";
import { useCavos } from "@cavos/react";
import { poseidonHashMany } from "@scure/starknet";
import { RpcProvider } from "starknet";
import { decodeMetaAddress, generateStealthAddress } from "../../../starknet-stealth-addresses/sdk/src/stealth";
import type { StealthAddressResult, StealthMetaAddress } from "../../../starknet-stealth-addresses/sdk/src/types";

type MetaAddressData = {
    schemeId: number;
    spendingKey: { x: string; y: string };
    viewingKey: { x: string; y: string };
};

export function SendStealthPaymentTab() {
    const [recipientAddress, setRecipientAddress] = useState("");
    const [metaAddress, setMetaAddress] = useState<MetaAddressData | null>(null);
    const [stealthAddress, setStealthAddress] = useState<StealthAddressResult | null>(null);
    const [step, setStep] = useState<"initial" | "fetched" | "generated">("initial");
    const provider = new RpcProvider({ nodeUrl: SEPOLIA_CONFIG.rpcUrl });
    const { execute } = useCavos();
    
    const handleFetchMeta = async () => {
        if (!recipientAddress) return;
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

        const decoded = decodeMetaAddress(spendingX, spendingY, viewingX, viewingY, schemeId);
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
        setStep("fetched");
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
        setStep("generated");
    };

    const handleDeployAndAnnounce = async () => {
        if (!stealthAddress) return;
        const schemeId = metaAddress?.schemeId ?? 0;
        const salt = poseidonHashMany([
            stealthAddress.ephemeralPubkey.x,
            stealthAddress.ephemeralPubkey.y,
        ]);

        const deployResult = await execute({
            contractAddress: SEPOLIA_CONFIG.factoryAddress,
            entrypoint: "deploy_stealth_account",
            calldata: [
                stealthAddress.stealthPubkey.x.toString(),
                stealthAddress.stealthPubkey.y.toString(),
                salt.toString(),
            ],
        });
        console.log("Deployed stealth account: ", deployResult);

        const announceResult = await execute({
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
        });
        console.log("Announced stealth address: ", announceResult);
    };

    return (
        <div className="flex flex-col gap-6">
            <Card>
                <CardHeader>
                    <CardTitle>SEND STEALTH PAYMENTS</CardTitle>
                    <CardDescription>
                        Enter a recipient's normal wallet address to securely derive a one-time stealth destination.
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
                                    setStep("initial"); // reset flow on input change
                                    setMetaAddress(null);
                                }}
                            />
                            <Button onClick={handleFetchMeta} disabled={!recipientAddress}>
                                Fetch Recipient Meta
                            </Button>
                        </div>
                    </div>

                    {step === "fetched" && (
                        <div className="flex flex-col gap-4 rounded-md border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
                            <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">✓ Meta address found on registry</p>
                            {metaAddress ? (
                                <div className="space-y-3 rounded-md border border-emerald-300/50 bg-emerald-50/40 p-3 dark:border-emerald-700/40 dark:bg-emerald-950/20">
                                    <div className="text-xs text-zinc-600 dark:text-zinc-300">Scheme ID: <span className="font-mono">{metaAddress.schemeId}</span></div>
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <div className="rounded border bg-white p-2 dark:bg-zinc-950">
                                            <div className="mb-1 text-xs font-medium">Spending Key</div>
                                            <pre className="overflow-x-auto text-xs">
{`x: ${metaAddress.spendingKey.x}
y: ${metaAddress.spendingKey.y}`}
                                            </pre>
                                        </div>
                                        <div className="rounded border bg-white p-2 dark:bg-zinc-950">
                                            <div className="mb-1 text-xs font-medium">Viewing Key</div>
                                            <pre className="overflow-x-auto text-xs">
{`x: ${metaAddress.viewingKey.x}
y: ${metaAddress.viewingKey.y}`}
                                            </pre>
                                        </div>
                                    </div>
                                </div>
                            ) : null}
                            <Button onClick={handleGenerate} variant="secondary" className="w-fit">
                                Generate Stealth Address
                            </Button>
                        </div>
                    )}

                    {step === "generated" && (
                        <div className="flex flex-col gap-6 rounded-md border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
                            <div className="flex flex-col gap-1">
                                <span className="text-xs text-zinc-500">Generated Stealth Destination:</span>
                                <span className="font-mono text-sm text-zinc-900 dark:text-zinc-50">
                                    {stealthAddress?.stealthAddress ?? ""}
                                </span>
                            </div>

                            <div className="flex justify-end">
                                <Button size="lg" onClick={handleDeployAndAnnounce} className="w-full sm:w-auto">
                                    Deploy + Announce
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
