"use client";

import { useCavos } from "@cavos/react";
import { ConnectWalletDropdown } from "./ConnectWalletDropdown";
import { ConnectedWallet } from "./ConnectedWallet";
import { useEffect, useState } from "react";

export function ConnectWallet() {
  const { isAuthenticated } = useCavos();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Prevent hydration mismatch by only rendering on client
  if (!mounted) {
    return <div className="h-10 w-32 border border-transparent" />; // Placeholder with approx height
  }

  return isAuthenticated ? <ConnectedWallet /> : <ConnectWalletDropdown />;
}
