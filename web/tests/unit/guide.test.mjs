// Every waiting state answers the five questions, for every role, in every phase.

import test from "node:test";
import assert from "node:assert/strict";

import { demoGuide, roleOf, sendingGuide, signGuide, tenderGuide } from "../../lib/guide.ts";
import { mapBid, mapTender } from "../../lib/parse.ts";
import { A, BUYER, M, ME, bidRow, tenderRow } from "./fixture.mjs";

const full = (g) => {
  for (const k of ["now", "time", "need", "leave", "money", "kicker"]) assert.ok(String(g[k]).trim().length > 3, `${g.id} lacks ${k}`);
  assert.equal(typeof g.mustAct, "boolean");
  assert.equal(typeof g.canLeave, "boolean");
  assert.doesNotMatch(JSON.stringify(g), /undefined|NaN/, g.id);
};

const OTHER = "0x0000000000000000000000000000000000000c33";
const scenes = [
  ["bidding", { phase: "bidding" }, 1200, { status: "committed" }],
  ["revealing", { phase: "revealing" }, 2000, { status: "committed" }],
  ["revealing, revealed", { phase: "revealing" }, 2000, {}],
  ["revealing, over budget", { phase: "revealing" }, 2000, { status: "over_budget", bond_to: "credit" }],
  ["reviewing, unassessed", {}, 2500, {}],
  ["reviewing, appeal window", { appeal_until: 3700 }, 2600, { mask: "MEETS,MISSES,MEETS", appeal_until: 3700, assessed_at: 2500 }],
  ["reviewing, compliant", { appeal_until: 3700, leader: "B2" }, 2600, { mask: "MEETS,MEETS,MEETS", compliant: true, placed: true, appeal_until: 3700 }],
  ["ready", { phase: "ready_to_award", award_ready: true }, 4000, { mask: "MEETS,MEETS,MEETS", compliant: true, placed: true, appeal_until: 3700 }],
  ["awarded", { status: "awarded", phase: "awarded", winner: { bid: "B2", bidder: ME, price: String(800n * M) }, price: String(800n * M), claimable_at: 999999 }, 5000, { mask: "MEETS,MEETS,MEETS", compliant: true }],
  ["paid", { status: "paid", phase: "paid", winner: { bid: "B2", bidder: ME, price: String(800n * M) }, closed_at: 6000 }, 7000, { bond_to: "credit" }],
  ["no award", { status: "no_award", phase: "no_award", returned: String(1200n * M) }, 7000, {}],
];

test("each scene, for the buyer, a bidder and a passer-by", () => {
  for (const [name, over, now, mine] of scenes) {
    const t = mapTender(tenderRow(over));
    const bids = [mapBid(bidRow("B1", 1, A, 600, { mask: "MEETS,MEETS,MEETS", compliant: true, appeal_until: 3700 })), mapBid(bidRow("B2", 2, ME, 800, mine))];
    for (const me of [BUYER, ME, OTHER]) {
      const g = tenderGuide(t, bids, me, now, { demo: true, credit: "0" });
      full(g);
      assert.ok(g.id.endsWith(roleOf(t, bids, me)), name);
    }
  }
});

test("the reveal window tells the bidder it must act and must not leave", () => {
  const t = mapTender(tenderRow({ phase: "revealing" }));
  const g = tenderGuide(t, [mapBid(bidRow("B2", 2, ME, 800, { status: "committed" }))], ME, 2000);
  assert.equal(g.mustAct, true);
  assert.equal(g.canLeave, false);
  assert.match(g.money, /held by the contract until you reveal/);
  assert.equal(g.left, 380);
});

test("the appeal window names the short requirement and the credit", () => {
  const t = mapTender(tenderRow({ appeal_until: 3700 }));
  const g = tenderGuide(t, [mapBid(bidRow("B2", 2, ME, 500, { mask: "MEETS,MISSES,MEETS", appeal_until: 3700 }))], ME, 2600, { credit: "0" });
  assert.match(g.now, /requirement 2/);
  assert.match(g.need, /0\.05 GEN/);
  assert.equal(g.left, 1100);
});

test("a rival may challenge a compliant bid; a passer-by may not", () => {
  const t = mapTender(tenderRow({ appeal_until: 3700 }));
  const bids = [mapBid(bidRow("B1", 1, A, 1000, { mask: "MEETS,MEETS,MEETS", compliant: true, placed: true, appeal_until: 3700 })), mapBid(bidRow("B2", 2, ME, 800, { mask: "MEETS,MISSES,MEETS", appeal: "upheld" }))];
  assert.match(tenderGuide(t, bids, ME, 2600).kicker, /Challenge/);
  assert.doesNotMatch(tenderGuide(t, bids, OTHER, 2600).kicker, /Challenge/);
});

test("the site's own waits", () => {
  for (const fn of ["bid", "reveal", "assess", "appeal", "challenge", "place", "award", "open_tender", "deposit", "complete"]) {
    full(signGuide(fn));
    full(sendingGuide(fn));
  }
  for (const m of ["asking", "open", "bid", "reveal", "assess", "place", "award", "complete", "reclaim"]) full(demoGuide(m));
  assert.match(sendingGuide("assess").now, /both orders/);
  // where the visitor signs, the small network fee is named
  for (const fn of ["bid", "open_tender", "withdraw"]) assert.match(signGuide(fn).money, /small network fee.*0\.1 GEN/);
});
