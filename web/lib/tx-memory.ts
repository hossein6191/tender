// What this browser remembers about each tender: the transactions it sent or asked the demo clerk to
// send, with what each one did. A contract does not know the hashes of the transactions that ran it, so
// a tender on chain cannot list them; the browser that sent them can, and the tender page links each one to
// the explorer.

import { readItem, writeItem } from "./browser-store.ts";
import { contractAddress } from "./config.ts";

export type Remembered = { hash: string; label: string; at: number };

const HASH = /^0x[0-9a-fA-F]{64}$/;
const MOCK = process.env.NEXT_PUBLIC_MOCK === "1";
const MOCK_LOAD = typeof window === "undefined" ? "" : Math.random().toString(36).slice(2, 10);
const scope = () => (MOCK ? `mock-${MOCK_LOAD}` : contractAddress() || "no-contract").toLowerCase();
const keyOf = (thing: string) => `tender:tx:${scope()}:${thing}`;

export const rememberedRaw = (thing: string): string => readItem(keyOf(thing));

export function parseRemembered(raw: string): Remembered[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as Remembered[];
    return Array.isArray(list) ? list.filter((r) => r && HASH.test(String(r.hash)) && typeof r.label === "string") : [];
  } catch {
    return [];
  }
}

export function rememberTx(thing: string, hash: string, label: string): void {
  if (!thing || !HASH.test(hash)) return;
  const list = parseRemembered(rememberedRaw(thing)).filter((r) => r.hash !== hash);
  list.unshift({ hash, label, at: Math.floor(Date.now() / 1000) });
  writeItem(keyOf(thing), JSON.stringify(list.slice(0, 20)));
}
