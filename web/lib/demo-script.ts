// The demonstration tender and everything the demo clerk may sign, word for word. The demo buyer (Elm Street
// Primary School) opens one tender with short windows; two rival decorators bid on it with proposals that
// differ on exactly one requirement: Brightwall is cheap and never promises low-VOC paint, Greenleaf is dear
// and meets every requirement. The visitor bids alone with one of two prepared proposals, or their own.
//
// demoMoves() is the clerk's whole rulebook: given the tender and its bids as the chain shows them, the three
// demo addresses and the chain's clock, it lists the moves the clerk may make now. The server signs nothing
// that is not on that list. Pure, so node runs it in tests/unit/demo.test.mjs.

import { concat, hexToBytes, keccak256, stringToBytes } from "viem";

import { commitmentOf } from "./commit.ts";
import { placeHint } from "./money.ts";
import type { Bid, DemoMove, Tender } from "./types.ts";

const M = 10n ** 15n; // a thousandth of a GEN

export const DEMO_TITLE = "Repaint Elm Street Primary classrooms";
export const DEMO_SCOPE = "Repaint the walls and ceilings of the twelve classrooms at Elm Street Primary School.";
export const DEMO_REQUIREMENTS = ["Paints all 12 classrooms", "Uses low-VOC paint", "Finishes within the summer break"];
export const DEMO_BUDGET = 1200n * M;
export const DEMO_BOND = 50n * M;

/** Windows, in seconds: bidding closes 13 minutes after the notice goes up (the contract's floor is ten). */
export const DEMO_WINDOWS = { bid: 780, reveal: 600, review: 600, complete: 1800 } as const;

export function demoDeadlines(now: number): { bidBy: number; revealBy: number; reviewBy: number; completeBy: number } {
  const bidBy = now + DEMO_WINDOWS.bid;
  const revealBy = bidBy + DEMO_WINDOWS.reveal;
  const reviewBy = revealBy + DEMO_WINDOWS.review;
  return { bidBy, revealBy, reviewBy, completeBy: reviewBy + DEMO_WINDOWS.complete };
}

export const DEMO_OPEN_ARGS = (now: number): (string | number)[] => {
  const d = demoDeadlines(now);
  return [DEMO_TITLE, DEMO_SCOPE, DEMO_REQUIREMENTS.join("|"), DEMO_BOND.toString(), d.bidBy, d.revealBy, d.reviewBy, d.completeBy];
};

export type RivalKey = "rival-a" | "rival-b";
export const RIVALS: { key: RivalKey; name: string; priceAtto: bigint; proposal: string; note: string }[] = [
  {
    key: "rival-a",
    name: "Brightwall Decorators",
    priceAtto: 600n * M,
    proposal:
      "We will paint all 12 classrooms, walls and ceilings, with two coats of standard acrylic emulsion, and finish within the summer break, between 21 July and 29 August.",
    note: "cheap, and never promises low-VOC paint",
  },
  {
    key: "rival-b",
    name: "Greenleaf Painting Co.",
    priceAtto: 1000n * M,
    proposal: "Our crew will repaint all 12 classrooms with low-VOC certified paint, two coats on walls and ceilings, starting 21 July and finishing within the summer break.",
    note: "dear, and meets every requirement",
  },
];

/** The two prepared bids the visitor can start from. */
export const VISITOR_CHIPS = [
  {
    key: "compliant",
    label: "A compliant bid, 0.8 GEN",
    priceText: "0.8",
    proposal: "We will paint all 12 classrooms, walls and ceilings, using only low-VOC water-based paint, and finish the whole job within the summer break, by 29 August.",
  },
  {
    key: "cheap",
    label: "A cheap bid that skips low-VOC, 0.5 GEN",
    priceText: "0.5",
    proposal: "We will paint all 12 classrooms, walls and ceilings, in a hard-wearing washable paint, and finish the whole job within the summer break, by 29 August.",
  },
] as const;

/** A rival's salt on one tender: 32 hex characters from the demo key, the tender and the rival, so the server keeps nothing. */
export function rivalSalt(cleanKey: string, tender: string, rival: RivalKey): string {
  return keccak256(concat([hexToBytes(cleanKey as `0x${string}`), stringToBytes(`tender-salt:${tender}:${rival}`)])).slice(2, 34);
}

export function rivalCommitment(cleanKey: string, tender: string, rival: RivalKey): string {
  const r = RIVALS.find((x) => x.key === rival)!;
  return commitmentOf(r.priceAtto, r.proposal, rivalSalt(cleanKey, tender, rival));
}

export type DemoAddrs = { buyer: string; "rival-a": string; "rival-b": string };
export type Move = { move: DemoMove; bid?: string; rival?: RivalKey; after?: string; label: string };

/** A rival's bid on the tender, if it has one. */
export const rivalBid = (bids: Bid[], addrs: DemoAddrs, rival: RivalKey): Bid | undefined => bids.find((b) => b.bidder === addrs[rival]);
export const rivalOf = (addrs: DemoAddrs, address: string): RivalKey | null => (address === addrs["rival-a"] ? "rival-a" : address === addrs["rival-b"] ? "rival-b" : null);

/** Bidding must still have this long to run for the rivals to bid: their transactions need time to land. */
export const MIN_BID_LEFT = 90;

/**
 * Every move the demo clerk may make now. `t` is null when the demo buyer has no tender yet. A fresh tender
 * may be opened only when the newest one has stopped taking bids.
 */
export function demoMoves(t: Tender | null, bids: Bid[], addrs: DemoAddrs, now: number): Move[] {
  if (!t || t.buyer !== addrs.buyer) return [{ move: "open", label: "Open a fresh demo tender" }];
  const out: Move[] = [];
  const bidding = t.status === "open" && now < t.bidBy;
  if (!bidding) out.push({ move: "open", label: "Open a fresh demo tender" });
  if (t.status === "open" && now < t.bidBy - MIN_BID_LEFT)
    for (const r of RIVALS) if (!rivalBid(bids, addrs, r.key)) out.push({ move: "bid", rival: r.key, label: `${r.name} bids` });
  if (t.status === "open" && now >= t.bidBy && now < t.revealBy)
    for (const r of RIVALS) {
      const b = rivalBid(bids, addrs, r.key);
      if (b && b.status === "committed") out.push({ move: "reveal", rival: r.key, bid: b.id, label: `${r.name} reveals ${b.id}` });
    }
  if (t.status === "open" && now < t.reviewBy)
    for (const b of bids) if (b.status === "revealed" && !b.mask) out.push({ move: "assess", bid: b.id, label: `Assess ${b.id}` });
  if (t.status === "open")
    for (const b of bids) {
      const after = placeHint(t, bids, b);
      if (after !== null) out.push({ move: "place", bid: b.id, after, label: `Place ${b.id}${after ? " after " + after : " at the head"}` });
    }
  if (t.status === "open" && t.awardReady) out.push({ move: "award", label: `Award ${t.id}` });
  if (t.status === "awarded") out.push({ move: "complete", label: "The school releases the payment" });
  if (t.status !== "open") for (const b of bids) if (b.status === "revealed" && !b.bondTo) out.push({ move: "reclaim", bid: b.id, label: `Reclaim ${b.id}'s bond` });
  return out;
}

/** The one move that matches a request, or null with why not. */
export function demoTurn(t: Tender | null, bids: Bid[], addrs: DemoAddrs, now: number, want: { move: DemoMove; bid?: string; rival?: string }): Move | string {
  const moves = demoMoves(t, bids, addrs, now).filter((m) => m.move === want.move);
  const match = moves.find((m) => (want.bid ? m.bid === want.bid : true) && (want.rival ? m.rival === want.rival : true));
  if (match) return match;
  const id = t?.id ?? "the demo tender";
  switch (want.move) {
    case "open":
      return `${id} is still taking bids; a fresh demo tender can be opened once its bidding closes`;
    case "bid":
      return `the rivals bid only while ${id} has more than ${MIN_BID_LEFT} seconds of bidding left, once each`;
    case "reveal":
      return `a rival reveals only during the reveal window of ${id}, once`;
    case "assess":
      return "only a bid revealed within budget and not yet assessed is assessed, before the review deadline";
    case "place":
      return "only a compliant bid not yet in the ordered list is placed";
    case "award":
      return `${id} is not ready to award yet`;
    case "complete":
      return `only an awarded demo tender is paid`;
    default:
      return "no bond on that bid is held any more";
  }
}
