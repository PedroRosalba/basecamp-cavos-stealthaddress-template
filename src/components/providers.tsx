'use client';

import { CavosProvider, SessionKeyPolicy } from '@cavos/react';

const SESSION_POLICY: SessionKeyPolicy = {
  allowedContracts: [
    '0x04718f5a0Fc34cC1AF16A1cdee98fFB20C31f5cD61D6Ab07201858f4287c938D', // STRK token
    '0x30e391e0fb3020ccdf4d087ef3b9ac43dae293fe77c96897ced8cc86a92c1f0', // StealthRegistry
    '0x2175848fdac537a13a84aa16b5c1d7cdd4ea063cd7ed344266b99ccc4395085', // StealthAccountFactory
  ],
  spendingLimits: [
    {
      token: '0x04718f5a0Fc34cC1AF16A1cdee98fFB20C31f5cD61D6Ab07201858f4287c938D',
      limit: BigInt('10000000000000000000'), // 10 STRK
    },
  ],
  maxCallsPerTx: 5,
};

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <CavosProvider
      config={{
        appId: process.env.NEXT_PUBLIC_CAVOS_APP_ID || '',
        network: 'sepolia',
        paymasterApiKey: process.env.NEXT_PUBLIC_CAVOS_PAYMASTER_API_KEY || '',
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