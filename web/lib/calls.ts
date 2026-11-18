// One builder per write method of contracts/tender.py: the method's name, its arguments in the contract's
// order, and the value sent. Pure; tests/unit/calls.test.mjs checks every builder against the signatures in
// the contract's source.

import type { Call } from "./types.ts";

const int = (n: number): number => Math.trunc(n);

export const calls = {
  /** deposit(), payable: credit for your own appeal and challenge bonds. */
  deposit: (valueAtto: bigint): Call => ({ fn: "deposit", args: [], value: valueAtto }),
  /** withdraw(amount_atto): part or all of your own credit, back to you. */
  withdraw: (amountAtto: bigint): Call => ({ fn: "withdraw", args: [amountAtto.toString()] }),
  /** open_tender(title, scope, requirements, bid_bond_atto, bid_by, reveal_by, review_by, complete_by), payable: the budget. */
  openTender: (title: string, scope: string, requirements: string[], bondAtto: bigint, bidBy: number, revealBy: number, reviewBy: number, completeBy: number, budgetAtto: bigint): Call => ({
    fn: "open_tender",
    args: [title, scope, requirements.join("|"), bondAtto.toString(), int(bidBy), int(revealBy), int(reviewBy), int(completeBy)],
    value: budgetAtto,
  }),
  /** bid(tender, commitment), payable: the bid bond exactly, or nothing to stake it from credit. */
  bid: (tender: string, commitment: string, bondAtto: bigint): Call => ({ fn: "bid", args: [tender, commitment], value: bondAtto }),
  /** reveal(bid, price_atto, proposal, salt). */
  reveal: (bid: string, priceAtto: bigint | string, proposal: string, salt: string): Call => ({ fn: "reveal", args: [bid, BigInt(priceAtto).toString(), proposal, salt] }),
  forfeit: (bid: string): Call => ({ fn: "forfeit", args: [bid] }),
  assess: (bid: string): Call => ({ fn: "assess", args: [bid] }),
  appeal: (bid: string, reason: string): Call => ({ fn: "appeal", args: [bid, reason] }),
  challenge: (bid: string, reason: string): Call => ({ fn: "challenge", args: [bid, reason] }),
  /** place(bid, after): after is "" for the head, or the placed bid it follows. */
  place: (bid: string, after: string): Call => ({ fn: "place", args: [bid, after] }),
  reclaim: (bid: string): Call => ({ fn: "reclaim", args: [bid] }),
  award: (tender: string): Call => ({ fn: "award", args: [tender] }),
  complete: (tender: string): Call => ({ fn: "complete", args: [tender] }),
  dispute: (tender: string): Call => ({ fn: "dispute", args: [tender] }),
  waive: (tender: string): Call => ({ fn: "waive", args: [tender] }),
  claimPayment: (tender: string): Call => ({ fn: "claim_payment", args: [tender] }),
};

/** The calls the validators judge with their models: the rail then shows their votes. */
export const isJudged = (fn: string) => fn === "assess" || fn === "appeal" || fn === "challenge";
