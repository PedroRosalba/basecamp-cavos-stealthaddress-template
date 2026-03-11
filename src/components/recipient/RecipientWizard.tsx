"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MetaAddressTab } from "./MetaAddressTab";
import type {
  GeneratedRecipientKeys,
  RecipientKeySyncState,
} from "./MetaAddressTab";
import { ScanAndClaimTab } from "./ScanAndClaimTab";

export function RecipientWizard() {
  const [generatedKeys, setGeneratedKeys] =
    useState<GeneratedRecipientKeys | null>(null);
  const [syncState, setSyncState] = useState<RecipientKeySyncState>({
    status: "idle",
    message: "Generate and sync keys in Meta-Address tab first.",
  });

  return (
    <Tabs defaultValue="meta-address" className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="meta-address">Meta-Address</TabsTrigger>
        <TabsTrigger value="scan-claim">Scan and Claim</TabsTrigger>
      </TabsList>
      <TabsContent value="meta-address" className="mt-6">
        <MetaAddressTab
          onKeysGenerated={setGeneratedKeys}
          onSyncStateChange={setSyncState}
        />
      </TabsContent>
      <TabsContent value="scan-claim" className="mt-6">
        <ScanAndClaimTab generatedKeys={generatedKeys} syncState={syncState} />
      </TabsContent>
    </Tabs>
  );
}
