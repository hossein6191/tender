// The order and the money of a tender, worked out as the contract works them.

import test from "node:test";
import assert from "node:assert/strict";

import { gen, parseGen, span } from "../../lib/format.ts";
import { awardReasons, awardSplit, before, bondWhere, creditShortfall, placeHint, placedOrder } from "../../lib/money.ts";
import { mapBid, mapTender } from "../../lib/parse.ts";
import { A, B, M, ME, bidRow, tenderRow } from "./fixture.mjs";

const bid = (...a) => mapBid(bidRow(...a));

test("a lower price ranks ahead; an equal price goes to the earlier commitment", () => {
  assert.equal(before(bid("B1", 1, A, 600), bid("B2", 2, B, 800)), true);
  assert.equal(before(bid("B2", 2, B, 800), bid("B1", 1, A, 600)), false);
  assert.equal(before(bid("B1", 1, A, 800), bid("B2", 2, B, 800)), true);
  assert.equal(before(bid("B2", 2, B, 800), bid("B1", 1, A, 800)), false);
});

test("place(): the hint is the last placed bid that ranks ahead, or the head", () => {
  const b1 = bid("B1", 1, A, 700, { compliant: true, placed: true, next: "B3" });
  const b3 = bid("B3", 3, B, 1000, { compliant: true, placed: true, prev: "B1" });
  const mine = bid("B2", 2, ME, 800, { compliant: true });
  const t = { leader: "B1" };
  assert.deepEqual(placedOrder("B1", [b3, mine, b1]).map((b) => b.id), ["B1", "B3"]);
  assert.equal(placeHint(t, [b1, mine, b3], mine), "B1");
  assert.equal(placeHint(t, [b1, mine, b3], { ...mine, priceAtto: String(1100n * M) }), "B3");
  assert.equal(placeHint(t, [b1, mine, b3], { ...mine, priceAtto: String(500n * M) }), "");
  assert.equal(placeHint(t, [b1, mine, b3], { ...mine, priceAtto: String(700n * M) }), "B1", "the same price as B1 but committed later: after it");
});

test("the award keeps the price and returns the rest; no winner returns it all", () => {
  assert.deepEqual(awardSplit(String(1200n * M), String(800n * M)), { held: 800n * M, back: 400n * M });
  assert.deepEqual(awardSplit(String(1200n * M), null), { held: 0n, back: 1200n * M });
});

test("an appeal or a challenge needs the bond in credit", () => {
  assert.equal(creditShortfall(String(50n * M), "0"), 50n * M);
  assert.equal(creditShortfall(String(50n * M), String(20n * M)), 30n * M);
  assert.equal(creditShortfall(String(50n * M), String(90n * M)), 0n);
});

test("where a bond is", () => {
  const t = { status: "open" };
  assert.match(bondWhere(bid("B1", 1, A, 600, { status: "committed" }), t), /until you reveal/);
  assert.match(bondWhere(bid("B1", 1, A, 600), t), /until the tender is decided/);
  assert.match(bondWhere(bid("B1", 1, A, 600), { status: "awarded" }), /reclaim/);
  assert.match(bondWhere(bid("B1", 1, A, 600, { bond_to: "challenger" }), t), /challenger/);
});

test("the award's reasons: the cheaper bid missed low-VOC, the winner is the cheapest compliant", () => {
  const t = mapTender(tenderRow({ status: "awarded", phase: "awarded", winner: { bid: "B3", bidder: ME, price: String(800n * M) }, price: String(800n * M), returned: String(400n * M) }));
  const bids = [bid("B1", 1, A, 600, { mask: "MEETS,MISSES,MEETS" }), bid("B2", 2, B, 1000, { mask: "MEETS,MEETS,MEETS", compliant: true }), bid("B3", 3, ME, 800, { mask: "MEETS,MEETS,MEETS", compliant: true })];
  const r = awardReasons(t, bids);
  assert.match(r.headline, /B3 at 0\.8 GEN/);
  assert.match(r.headline, /0\.4 GEN of the budget went back/);
  assert.deepEqual(r.lines.map((l) => l.bid), ["B1", "B3"]);
  assert.match(r.lines[0].line, /misses requirement 2/);
  const none = awardReasons(mapTender(tenderRow({ status: "no_award", phase: "no_award" })), [bids[0]]);
  assert.match(none.headline, /No award/);
});

test("amounts print and parse", () => {
  assert.equal(gen(800n * M), "0.8 GEN");
  assert.equal(gen(50n * M), "0.05 GEN");
  assert.equal(gen("x"), "0 GEN");
  assert.equal(parseGen("0.8"), 800n * M);
  assert.equal(parseGen(".05"), 50n * M);
  assert.equal(parseGen("1.2.3"), null);
  assert.equal(span(780), "13 min");
});
