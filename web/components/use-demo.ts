"use client";

import { useAfterTx, useRead } from "@/components/use-read";
import { readDemoStatus } from "@/lib/chain";

/** The demo clerk's status: whether it can act now, its three addresses, its newest tender. */
export function useDemoStatus() {
  const state = useRead(async () => ({ data: await readDemoStatus(), source: "chain" as const }), ["demo"]);
  useAfterTx(state.refresh);
  return state;
}
