"use client";

import { useCavos } from '@cavos/react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ConnectWalletDropdown() {
    const { login, register } = useCavos();

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="default">Connect Wallet</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Social Login</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={(e) => { e.preventDefault(); login('google'); }} className="cursor-pointer">
                    Continue with Google
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={(e) => { e.preventDefault(); login('apple'); }} className="cursor-pointer">
                    Continue with Apple
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Email (Demo)</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    onSelect={(e) => { e.preventDefault(); login('firebase', { email: 'user@example.com', password: 'password123' }); }}
                    className="cursor-pointer"
                >
                    Login with Email
                </DropdownMenuItem>
                <DropdownMenuItem
                    onSelect={(e) => { e.preventDefault(); register('firebase', { email: 'user@example.com', password: 'password123' }); }}
                    className="cursor-pointer"
                >
                    Sign Up with Email
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
