"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MetaAddressTab } from "./MetaAddressTab";
import { ScanAndClaimTab } from "./ScanAndClaimTab";

export function RecipientWizard() {
  return (
    <Tabs defaultValue="meta-address" className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="meta-address">Meta-Address</TabsTrigger>
        <TabsTrigger value="scan-claim">Scan and Claim</TabsTrigger>
      </TabsList>
      <TabsContent value="meta-address" className="mt-6">
        <MetaAddressTab />
      </TabsContent>
      <TabsContent value="scan-claim" className="mt-6">
        <ScanAndClaimTab />
      </TabsContent>
    </Tabs>
  );
}
