"use client";

import { SEPOLIA_CONFIG } from "@/constants";
import { CavosProvider, SessionKeyPolicy } from "@cavos/react";

const SESSION_POLICY: SessionKeyPolicy = {
  allowedContracts: [
    "0x04718f5a0Fc34cC1AF16A1cdee98fFB20C31f5cD61D6Ab07201858f4287c938D", // STRK token
    SEPOLIA_CONFIG.registryAddress,
    SEPOLIA_CONFIG.factoryAddress,
  ],
  spendingLimits: [
    {
      token:
        "0x04718f5a0Fc34cC1AF16A1cdee98fFB20C31f5cD61D6Ab07201858f4287c938D",
      limit: BigInt("10000000000000000000"), // 10 STRK
    },
  ],
  maxCallsPerTx: 5,
};

export function Providers({ children }: { children: React.ReactNode }) {
  const paymasterApiKey =
    process.env.NEXT_PUBLIC_CAVOS_PAYMASTER_API_KEY ||
    process.env.NEXT_PUBLIC_PAYMASTER_API_KEY ||
    "";

  return (
    <CavosProvider
      config={{
        appId: process.env.NEXT_PUBLIC_CAVOS_APP_ID || "",
        network: "sepolia",
        paymasterApiKey,
        enableLogging: true,
        session: {
          defaultPolicy: SESSION_POLICY,
        },
      }}
    >
      {children}
    </CavosProvider>
  );
}
