"use client";

// Who is acting: the connected wallet's address, or in mock mode the persona chosen in the mock bar.

import { useLocal } from "@/components/use-local";
import { useWallet } from "@/components/wallet";
import { isMock } from "@/lib/chain";
import { mockAddress } from "@/lib/chain-mock";

export function useMe(): string {
  const w = useWallet();
  const mock = useLocal(() => (isMock ? mockAddress() : ""), "");
  return isMock ? mock : w.address;
}
