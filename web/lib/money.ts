// The money and the order of a tender, worked out the way contracts/tender.py works them, in integers:
// which bid ranks ahead, where a compliant bid goes in the ordered list (the `after` hint place() takes),
// what the award returns to the buyer, what credit an appeal or a challenge still needs, where a bid's
// bond is, and why the award went where it went. The pages use it to preview and explain; the contract is
// always the one that moves money. Pure, so node runs it in tests/unit/money.test.mjs.

import { big, gen } from "./format.ts";
import { maskSummary } from "./parse.ts";
import type { Bid, Tender } from "./types.ts";

/** True when bid a ranks ahead of bid b: a lower price, or the same price and an earlier commitment. */
export const before = (a: Pick<Bid, "priceAtto" | "number">, b: Pick<Bid, "priceAtto" | "number">): boolean =>
  big(a.priceAtto) < big(b.priceAtto) || (big(a.priceAtto) === big(b.priceAtto) && a.number < b.number);

/** The placed bids in list order, walked from the head by their next links (at most one lap). */
export function placedOrder(head: string, bids: Bid[]): Bid[] {
  const byId = new Map(bids.map((b) => [b.id, b]));
  const out: Bid[] = [];
  const seen = new Set<string>();
  for (let id = head; id && !seen.has(id); id = byId.get(id)?.next ?? "") {
    const b = byId.get(id);
    if (!b) break;
    seen.add(id);
    out.push(b);
  }
  return out;
}

/**
 * The `after` argument place(bid, after) needs: "" for the head, else the last placed bid that ranks
 * ahead of it. null when the bid is not one place() takes (not compliant, or placed already).
 */
export function placeHint(t: Pick<Tender, "leader">, bids: Bid[], bid: Bid): string | null {
  if (!bid.compliant || bid.placed) return null;
  let after = "";
  for (const p of placedOrder(t.leader, bids)) {
    if (before(p, bid)) after = p.id;
    else break;
  }
  return after;
}

/** At the award: the winner's price stays held and the rest of the budget goes back; all of it with no winner. */
export function awardSplit(budgetAtto: string, winnerPriceAtto: string | null): { held: bigint; back: bigint } {
  const budget = big(budgetAtto);
  if (winnerPriceAtto === null) return { held: 0n, back: budget };
  const price = big(winnerPriceAtto);
  return { held: price, back: budget - price };
}

/** What an appeal or a challenge still needs deposited: the bid bond less the credit held, never below 0. */
export const creditShortfall = (bondAtto: string, creditAtto: string): bigint => {
  const need = big(bondAtto) - big(creditAtto);
  return need > 0n ? need : 0n;
};

/** Where one bid's bond is right now, in a sentence. */
export function bondWhere(b: Bid, t: Pick<Tender, "status">): string {
  const amount = gen(b.bondAtto);
  if (b.status === "committed") return `${amount} bid bond is held by the contract until you reveal`;
  if (b.status === "forfeited") return `${amount} bid bond went to the buyer: the bid was never revealed`;
  if (b.bondTo === "challenger") return `${amount} bid bond went to the challenger who knocked the bid out`;
  if (b.bondTo === "credit") return `${amount} bid bond is back in the bidder's credit`;
  return t.status === "open" ? `${amount} bid bond is held by the contract until the tender is decided` : `${amount} bid bond is still held; anyone may reclaim it to the bidder's credit now`;
}

export type Reason = { bid: string; line: string };

/**
 * Why the award went where it went, cheapest first: the winner, and for every bid priced at or below it
 * (or every bid when nobody won) why it did not win.
 */
export function awardReasons(t: Tender, bids: Bid[]): { headline: string; lines: Reason[] } {
  const count = t.requirements.length;
  const why = (b: Bid): string => {
    if (b.status === "committed") return "never revealed, so it could not be judged";
    if (b.status === "forfeited") return "never revealed; its bond went to the buyer";
    if (b.status === "over_budget") return `over the budget of ${gen(t.budgetAtto)}`;
    if (b.challenge === "knocked_out") return `knocked out by a challenge: ${maskSummary(b.mask, count)}`;
    if (!b.mask) return "nobody assessed it before the review deadline";
    if (b.compliant) return "meets every requirement, but a cheaper compliant bid ranks ahead";
    return maskSummary(b.mask, count);
  };
  const winner = t.winner ? bids.find((b) => b.id === t.winner!.bid) : undefined;
  const shown = [...bids].filter((b) => b.status !== "committed" || t.status !== "open").sort((a, b) => (before(a, b) ? -1 : 1));
  const lines: Reason[] = [];
  for (const b of shown) {
    if (winner && b.id === winner.id) lines.push({ bid: b.id, line: `${gen(b.priceAtto)}: meets every requirement and is the cheapest that does. Awarded.` });
    else if (!winner || before(b, winner) || b.status !== "revealed") lines.push({ bid: b.id, line: `${b.status === "revealed" || b.status === "over_budget" ? gen(b.priceAtto) + ": " : ""}${why(b)}.` });
  }
  const headline = winner
    ? `Awarded to ${winner.id} at ${gen(winner.priceAtto)}, the cheapest bid that meets every requirement. ${gen(awardSplit(t.budgetAtto, winner.priceAtto).back)} of the budget went back to the buyer.`
    : `No award: no bid met every requirement. The whole budget, ${gen(t.budgetAtto)}, went back to the buyer.`;
  return { headline, lines };
}
