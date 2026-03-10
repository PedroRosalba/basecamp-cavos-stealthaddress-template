"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SendStealthPaymentTab } from "./SendStealthPaymentTab";

export function SenderWizard() {
  return (
    <Tabs defaultValue="send" className="w-full">
      <TabsList className="grid w-full grid-cols-1">
        <TabsTrigger value="send">Send Stealth Payment</TabsTrigger>
      </TabsList>
      <TabsContent value="send" className="mt-6">
        <SendStealthPaymentTab />
      </TabsContent>
    </Tabs>
  );
}
