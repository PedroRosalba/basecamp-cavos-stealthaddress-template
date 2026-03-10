import { RecipientWizard } from "@/components/recipient/RecipientWizard";

export default function RecipientPage() {
  return (
    <main className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center p-4 md:p-8">
      <div className="w-full max-w-3xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
            Recipient Dashboard
          </h1>
          <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">
            Manage your stealth addresses and claim your funds.
          </p>
        </div>
        <RecipientWizard />
      </div>
    </main>
  );
}
