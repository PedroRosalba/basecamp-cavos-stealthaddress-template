"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { computeStealthContractAddress, createMetaAddress, encodeMetaAddress, generatePrivateKey } from "../../../starknet-stealth-addresses/sdk/src/stealth";
import { SEPOLIA_CONFIG } from "@/constants";
import { useCavos } from "@cavos/react";
import { STEALTH_REGISTRY_ABI } from "@/abi/registry";

type EncodedKeys = {
    spendingX: string;
    spendingY: string;
    viewingX: string;
    viewingY: string;
    schemeId: string;
};

export function MetaAddressTab() {
    const { execute, walletStatus } = useCavos();
    const [spendingPrivKey, setSpendingPrivKey] = useState<bigint>(0n);
    const [viewingPrivKey, setViewingPrivKey] = useState<bigint>(0n);
    const [keysGenerated, setKeysGenerated] = useState(false);
    const [accountAddress, setAccountAddress] = useState<string>("");
    const [keys, setKeys] = useState<EncodedKeys | null>(null);
    const generateKeys = () => {
        const spendingPrivKey = generatePrivateKey();
        setSpendingPrivKey(spendingPrivKey);
        const viewingPrivKey = generatePrivateKey();
        setViewingPrivKey(viewingPrivKey);
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
                constructorCalldata: [BigInt(encoded.spendingX), BigInt(encoded.spendingY)],
            })
        );
        setKeysGenerated(true);
        console.log("Generated meta address: ", metaAddress);
    };

    const registerKeys = async () => {
        if (!keys || !walletStatus.isReady) return;

        await execute({
            contractAddress: SEPOLIA_CONFIG.registryAddress,
            entrypoint: "register_stealth_meta_address",
            calldata: [
                keys.spendingX,
                keys.spendingY,
                keys.viewingX,
                keys.viewingY,
                keys.schemeId,
            ],
        });
        console.log("Registered keys: ", keys);
    };

    return (
        <div className="flex flex-col gap-6">
            <Card>
                <CardHeader>
                    <CardTitle>Generate your keys and register them on-chain</CardTitle>
                    <CardDescription>
                        Create local spending and viewing keys to derive your stealth meta-address.
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
                                    SAVE YOUR PRIVATE KEY!
                                </h4>
                                <p className="mb-3 text-xs text-amber-800 dark:text-amber-200/70">
                                    You need it to claim payments. It will not be shown again.
                                </p>
                                <div className="break-all rounded bg-white/50 px-3 py-2 font-mono text-xs text-amber-950 dark:bg-black/50 dark:text-amber-200">
                                    {spendingPrivKey.toString()}
                                </div>
                            </div>

                            {accountAddress ? (
                                <div className="rounded-md border p-4">
                                    <h4 className="mb-2 text-sm font-semibold">Account Address (preview)</h4>
                                    <div className="break-all rounded bg-zinc-100 px-3 py-2 font-mono text-xs dark:bg-zinc-900">
                                        {accountAddress}
                                    </div>
                                </div>
                            ) : null}

                            <div className="flex flex-col gap-4 sm:flex-row sm:justify-end">
                                <Button variant="outline" onClick={generateAndEncodeMetaAddress}>Generate Meta-Address</Button>
                                <Button onClick={registerKeys} disabled={!keys}>Register Your Keys Onchain</Button>
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
