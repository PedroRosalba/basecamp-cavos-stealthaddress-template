"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MetaAddressTab } from "./MetaAddressTab";
import type { GeneratedRecipientKeys } from "./MetaAddressTab";
import { ScanAndClaimTab } from "./ScanAndClaimTab";

export function RecipientWizard() {
  const [generatedKeys, setGeneratedKeys] =
    useState<GeneratedRecipientKeys | null>(null);

  return (
    <Tabs defaultValue="meta-address" className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="meta-address">Meta-Address</TabsTrigger>
        <TabsTrigger value="scan-claim">Scan and Claim</TabsTrigger>
      </TabsList>
      <TabsContent value="meta-address" className="mt-6">
        <MetaAddressTab onKeysGenerated={setGeneratedKeys} />
      </TabsContent>
      <TabsContent value="scan-claim" className="mt-6">
        <ScanAndClaimTab generatedKeys={generatedKeys} />
      </TabsContent>
    </Tabs>
  );
}
