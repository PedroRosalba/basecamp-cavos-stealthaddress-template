import { NetworkStarknet } from "@web3icons/react";

export default function Home() {
  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-white px-6">
      <section className="flex max-w-xl flex-col items-center gap-6 text-center">
        <NetworkStarknet
          variant="mono"
          size={112}
          color="#000000"
          aria-hidden="true"
        />
        <h1 className="text-center text-2xl font-medium tracking-tight text-black md:text-3xl">
          <span className="block">stealth address</span>
          <span className="block pt-3">
            the master privacy toolkit on Starknet
          </span>
        </h1>
      </section>
    </main>
  );
}
