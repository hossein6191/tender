// The sealed bid, computed exactly as contracts/tender.py checks it at reveal():
// sha256(price_atto + "|" + proposal + "|" + salt) over the UTF-8 bytes, 64 lower-case hex characters, the
// price in atto as plain digits with no leading zero. The proposal is trimmed once, here, and kept and
// revealed exactly as committed. tests/unit/commit.test.mjs checks every case against the contract's own
// _commitment() and _fingerprint().

import { sha256, stringToBytes } from "viem";

import { pyStrip } from "./rules.ts";

export const sha256Hex = (text: string): string => sha256(stringToBytes(text)).slice(2);

/** The commitment of a price (atto), a proposal and a salt. */
export function commitmentOf(priceAtto: bigint | string, proposal: string, salt: string): string {
  return sha256Hex(BigInt(priceAtto).toString() + "|" + proposal + "|" + salt);
}

/** The proposal as it will be committed and revealed: trimmed once. */
export const sealedProposal = (text: string): string => pyStrip(String(text ?? ""));

const ALNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** 32 random letters and digits from the browser's (or node's) secure generator. */
export function newSalt(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  // 62 does not divide 256: draw again for the top values so every character is equally likely.
  let out = "";
  for (let i = 0; out.length < 32; i++) {
    if (i >= bytes.length) {
      globalThis.crypto.getRandomValues(bytes);
      i = 0;
    }
    if (bytes[i] < 248) out += ALNUM[bytes[i] % 62];
  }
  return out;
}

/** Python's json.dumps(..., sort_keys=True) for ASCII strings: what _fingerprint() hashes. */
function pyString(s: string): string {
  return JSON.stringify(s).replace(/[\u007f-￿]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
}

/** The fingerprint the contract stores beside a mask: the sha256 of exactly the text judged and who wrote the note. */
export function fingerprintOf(requirements: string[], proposal: string, note = "", side: "" | "bidder" | "challenger" = ""): string {
  const json = `{"note": ${pyString(note)}, "proposal": ${pyString(proposal)}, "requirements": [${requirements.map(pyString).join(", ")}], "side": ${pyString(side)}}`;
  return sha256Hex(json);
}
