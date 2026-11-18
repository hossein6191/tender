// The demo clerk's one server secret, DEMO_KEY, read forgivingly from the host's environment, and the
// three throwaway accounts derived from it: keccak256 of the key's 32 bytes followed by a label ("buyer",
// "rival-a", "rival-b"). The same key pasted with or without 0x, in quotes, with spaces or in capitals
// always gives the same three accounts. Nothing here ever prints the key; the problems are said in words
// that never repeat it. Pure, so node runs it in tests/unit; only lib/demo-server.ts and
// tools/open-demo.mjs call it with a real key.

import { concat, hexToBytes, keccak256, stringToBytes } from "viem";
import { privateKeyToAddress } from "viem/accounts";

export const NO_KEY = "no key set";
export const BAD_KEY = "the key set is not a 0x private key of 64 hex characters";

export const LABELS = ["buyer", "rival-a", "rival-b"] as const;
export type Label = (typeof LABELS)[number];

/** secp256k1's group order: a private key is a number from 1 to n - 1. */
const N = BigInt("0x" + "fffffffffffffffffffffffffffffffe" + "baaedce6af48a03bbfd25e8cd0364141");

const unwrap = (raw: string | undefined) =>
  String(raw ?? "")
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, "");

/** The key as it was pasted, made usable when it can be: lowercase, with its 0x. Anything else stays unusable. */
export function cleanKey(raw: string | undefined): string {
  let key = unwrap(raw);
  if (/^[0-9a-fA-F]{64}$/.test(key)) key = "0x" + key;
  if (/^0[xX][0-9a-fA-F]{64}$/.test(key)) key = "0x" + key.slice(2).toLowerCase();
  return key;
}

/** "" when the key can be used, else exactly which problem it is. */
export function keyProblem(raw: string | undefined): string {
  if (!unwrap(raw)) return NO_KEY;
  if (!/^0x[0-9a-f]{64}$/.test(cleanKey(raw))) return BAD_KEY;
  return "";
}

/** One derived private key: keccak256(key bytes ++ label bytes). "" when the key is unusable or the hash is not a valid scalar. */
export function deriveKey(raw: string | undefined, label: Label): `0x${string}` | "" {
  if (keyProblem(raw)) return "";
  const k = keccak256(concat([hexToBytes(cleanKey(raw) as `0x${string}`), stringToBytes(label)]));
  const n = BigInt(k);
  return n > 0n && n < N ? k : "";
}

/** The three derived accounts' private keys and public addresses (lowercase); null when the key is unusable. */
export function deriveAll(raw: string | undefined): Record<Label, { key: `0x${string}`; address: string }> | null {
  const out: Partial<Record<Label, { key: `0x${string}`; address: string }>> = {};
  for (const label of LABELS) {
    const key = deriveKey(raw, label);
    if (!key) return null;
    out[label] = { key, address: privateKeyToAddress(key).toLowerCase() };
  }
  return out as Record<Label, { key: `0x${string}`; address: string }>;
}
