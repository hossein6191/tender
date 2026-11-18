// Reveal slips: what a sealed bid needs to be opened later (the price, the proposal exactly as committed,
// the salt), kept in this browser's localStorage before the bid is even signed, and offered as a file to
// download or a text to copy. Without its slip a bid cannot be revealed, and an unrevealed bid's bond goes
// to the buyer. Keyed by register, tender and bidder address, so a slip never opens somebody else's bid.

import { readItem, writeItem } from "./browser-store.ts";
import { commitmentOf } from "./commit.ts";
import { contractAddress } from "./config.ts";
import { isSalt } from "./rules.ts";

export type Slip = {
  v: 1;
  register: string;
  tender: string;
  bidder: string;
  priceAtto: string;
  proposal: string;
  salt: string;
  commitment: string;
  /** the bid id once the bid() transaction is final; "" before */
  bid: string;
  at: number;
};

const MOCK = process.env.NEXT_PUBLIC_MOCK === "1";
const register = () => (MOCK ? "mock" : contractAddress() || "no-contract").toLowerCase();
const keyOf = (tender: string, bidder: string) => `tender:slip:${register()}:${tender}:${bidder.toLowerCase()}`;
const INDEX = () => `tender:slips:${register()}`;

/** A slip read from any text (a stored item, a pasted slip, a downloaded file); null unless it is whole and adds up. */
export function parseSlip(raw: string): Slip | null {
  try {
    const s = JSON.parse(raw) as Partial<Slip>;
    if (!s || typeof s !== "object") return null;
    const ok =
      /^T[1-9]\d{0,8}$/.test(String(s.tender)) &&
      /^0x[0-9a-f]{40}$/.test(String(s.bidder)) &&
      /^[1-9]\d*$/.test(String(s.priceAtto)) &&
      typeof s.proposal === "string" &&
      isSalt(s.salt) &&
      s.commitment === commitmentOf(String(s.priceAtto), s.proposal, String(s.salt));
    if (!ok) return null;
    return { v: 1, register: String(s.register ?? ""), tender: String(s.tender), bidder: String(s.bidder), priceAtto: String(s.priceAtto), proposal: s.proposal!, salt: String(s.salt), commitment: String(s.commitment), bid: /^B[1-9]\d{0,8}$/.test(String(s.bid)) ? String(s.bid) : "", at: Number(s.at) || 0 };
  } catch {
    return null;
  }
}

export const slipRaw = (tender: string, bidder: string): string => (tender && bidder ? readItem(keyOf(tender, bidder)) : "");
export const readSlip = (tender: string, bidder: string): Slip | null => parseSlip(slipRaw(tender, bidder));

export function saveSlip(slip: Slip): void {
  writeItem(keyOf(slip.tender, slip.bidder), JSON.stringify(slip));
  const list = slipIndex().filter((k) => k !== `${slip.tender}:${slip.bidder}`);
  list.unshift(`${slip.tender}:${slip.bidder}`);
  writeItem(INDEX(), JSON.stringify(list.slice(0, 50)));
}

/** "T3:0xabc…" for every slip this browser keeps on this register, newest first. */
export function slipIndex(): string[] {
  try {
    const v = JSON.parse(readItem(INDEX()) || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
export const slipIndexRaw = (): string => readItem(INDEX());

/** The slip as a file a person keeps: the JSON, pretty, with a line saying what it is. */
export const slipText = (s: Slip): string => JSON.stringify({ ...s, note: "Tender reveal slip: keep this until you have revealed your bid." }, null, 2);
export const slipFileName = (s: Slip): string => `tender-${s.tender}-reveal-slip.json`;
export const slipFor = (o: Omit<Slip, "v" | "register" | "commitment" | "at" | "bid">): Slip => ({
  v: 1,
  register: register(),
  ...o,
  bidder: o.bidder.toLowerCase(),
  commitment: commitmentOf(o.priceAtto, o.proposal, o.salt),
  bid: "",
  at: Math.floor(Date.now() / 1000),
});
