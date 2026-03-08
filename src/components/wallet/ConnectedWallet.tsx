"use client";

import { SEPOLIA_CONFIG, STRK_TOKEN_ADDRESS } from '@/constants';
import { useCavos } from '@cavos/react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useState } from 'react';
import { RpcProvider } from 'starknet';

const STRK_DECIMALS = BigInt('1000000000000000000');
const U128_MASK = (BigInt(1) << BigInt(128)) - BigInt(1);

function parseStrkToWei(value: string): bigint {
    const trimmed = value.trim();
    if (!/^\d+(\.\d+)?$/.test(trimmed)) {
        throw new Error('Invalid STRK amount');
    }

    const [wholePart, fractionPart = ''] = trimmed.split('.');
    const normalizedFraction = (fractionPart + '0'.repeat(18)).slice(0, 18);
    const whole = BigInt(wholePart || '0') * STRK_DECIMALS;
    const fraction = BigInt(normalizedFraction || '0');
    return whole + fraction;
}

export function ConnectedWallet() {
    const { user, address, execute, walletStatus } = useCavos();

    const [recipientAddress, setRecipientAddress] = useState('');
    const [amount, setAmount] = useState('');
    const [balance, setBalance] = useState<string | null>(null);
    const [lastTxHash, setLastTxHash] = useState<string | null>(null);
    const [isLoadingBalance, setIsLoadingBalance] = useState(false);
    const [balanceError, setBalanceError] = useState<string | null>(null);

    const handleBalance = async () => {
        if (!walletStatus.isReady || !address) {
            setBalanceError('Wallet not ready yet.');
            return;
        }

        setIsLoadingBalance(true);
        setBalanceError(null);

        try {
            const provider = new RpcProvider({
                nodeUrl: SEPOLIA_CONFIG.rpcUrl,
            });

            const result = await provider.callContract({
                contractAddress: STRK_TOKEN_ADDRESS,
                entrypoint: 'balanceOf',
                calldata: [address],
            });

            const low = BigInt(result[0] ?? '0');
            const high = BigInt(result[1] ?? '0');
            const rawBalance = (high << BigInt(128)) + low;
            const decimals = BigInt('1000000000000000000');
            const whole = rawBalance / decimals;
            const fraction = (rawBalance % decimals).toString().padStart(18, '0').slice(0, 4);
            const trimmedFraction = fraction.replace(/0+$/, '');
            const formattedBalance = trimmedFraction ? `${whole.toString()}.${trimmedFraction} STRK` : `${whole.toString()} STRK`;

            setBalance(formattedBalance);
            console.log('STRK balance (raw):', rawBalance.toString());
        } catch (error) {
            console.error('Balance query failed:', error);
            setBalanceError('Failed to fetch STRK balance.');
        } finally {
            setIsLoadingBalance(false);
        }
    };

    const handleSend = async () => {
        if (!walletStatus.isReady) {
            console.log('Wallet not ready yet');
            return;
        }

        try {
            const amountWei = parseStrkToWei(amount);
            const amountLow = (amountWei & U128_MASK).toString();
            const amountHigh = (amountWei >> BigInt(128)).toString();

            const txHash = await execute({
                contractAddress: STRK_TOKEN_ADDRESS,
                entrypoint: 'transfer',
                calldata: [recipientAddress, amountLow, amountHigh],
            });

            setLastTxHash(txHash);
            console.log('Transaction hash:', txHash);
            alert(`Example TX sent! Hash: ${txHash}`);
        } catch (error) {
            console.error('Transaction failed:', error);
            alert('Transaction failed!');
        }
    };

    return (
        <div className="flex items-center gap-4">
            <div className="flex flex-col items-end">
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {user?.id ? `${user.id.slice(0, 6)}...${user.id.slice(-4)}` : 'Connected'}
                </span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {walletStatus.isReady ? 'Wallet Ready' : 'Setting up...'}
                </span>
            </div>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                        Send Example TX
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80 p-4">
                    <DropdownMenuLabel className="px-0 pb-4">
                        <div className="text-base">Send Tokens</div>
                        <div className="text-xs font-normal text-zinc-500">Test your wallet by sending a transaction.</div>
                    </DropdownMenuLabel>
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="address">Recipient Address</Label>
                            <Input
                                id="address"
                                placeholder="0x..."
                                value={recipientAddress}
                                onChange={(e) => setRecipientAddress(e.target.value)}
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="amount">Amount (STRK)</Label>
                            <Input
                                id="amount"
                                placeholder="0.01"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                            />
                        </div>
                        <Button onClick={handleSend} className="mt-2 w-full" disabled={!walletStatus.isReady || !recipientAddress || !amount}>
                            Execute Transaction
                        </Button>
                        {lastTxHash ? (
                            <a
                                href={`https://sepolia.voyager.online/tx/${lastTxHash}`}
                                target="_blank"
                                rel="noreferrer"
                                className="break-all text-xs text-blue-600 underline"
                            >
                                View tx: {lastTxHash}
                            </a>
                        ) : null}
                    </div>
                </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                        Get Balance
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80 p-4">
                    <DropdownMenuLabel className="px-0 pb-4">
                        <div className="text-base">Wallet Balance</div>
                        <div className="text-xs font-normal text-zinc-500">Check your STRK token balance.</div>
                    </DropdownMenuLabel>
                    <div className="flex flex-col gap-3">
                        <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900">
                            {balanceError ? (
                                <span className="text-red-600 dark:text-red-400">{balanceError}</span>
                            ) : (
                                <span className="break-all text-zinc-900 dark:text-zinc-100">
                                    {balance ?? 'No balance fetched yet.'}
                                </span>
                            )}
                        </div>
                        <Button onClick={handleBalance} className="w-full" disabled={isLoadingBalance || !walletStatus.isReady}>
                            {isLoadingBalance ? 'Fetching...' : 'Fetch Balance'}
                        </Button>
                    </div>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
