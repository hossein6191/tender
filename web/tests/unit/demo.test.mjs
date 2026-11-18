// The demo clerk's rulebook: which moves it may make in each phase, what it refuses and why, and the key
// that derives its three accounts, read forgivingly.

import test from "node:test";
import assert from "node:assert/strict";

import { deriveAll, keyProblem, NO_KEY, BAD_KEY } from "../../lib/demo-key.ts";
import { DEMO_WINDOWS, demoDeadlines, demoMoves, demoTurn, MIN_BID_LEFT } from "../../lib/demo-script.ts";
import { mapBid, mapTender } from "../../lib/parse.ts";
import { A, B, BUYER, ME, bidRow, tenderRow } from "./fixture.mjs";

const addrs = { buyer: BUYER, "rival-a": A, "rival-b": B };
const T = (over) => mapTender(tenderRow(over));
const bid = (...a) => mapBid(bidRow(...a));
const kinds = (moves) => moves.map((m) => m.move + (m.rival ? ":" + m.rival : "") + (m.bid ? ":" + m.bid : ""));

test("no demo tender yet: the one move is to open one", () => {
  assert.deepEqual(kinds(demoMoves(null, [], addrs, 1000)), ["open"]);
  assert.deepEqual(kinds(demoMoves(T({ buyer: ME }), [], addrs, 1000)), ["open"], "a visitor's tender is not a demo tender");
});

test("bidding: the rivals bid once each while time is left; no fresh tender yet", () => {
  const t = T({ phase: "bidding", bids: 0 });
  assert.deepEqual(kinds(demoMoves(t, [], addrs, 1100)), ["bid:rival-a", "bid:rival-b"]);
  assert.deepEqual(kinds(demoMoves(t, [bid("B1", 1, A, 600, { status: "committed" })], addrs, 1100)), ["bid:rival-b"]);
  assert.deepEqual(kinds(demoMoves(t, [], addrs, t.bidBy - MIN_BID_LEFT)), [], "too close to the deadline");
  assert.match(String(demoTurn(t, [], addrs, 1100, { move: "open" })), /still taking bids/);
});

test("revealing: each rival reveals its own committed bid; revealed bids may be assessed; a fresh tender may open", () => {
  const t = T({ phase: "revealing" });
  const bids = [bid("B1", 1, A, 600, { status: "committed" }), bid("B2", 2, B, 1000), bid("B3", 3, ME, 800, { status: "committed" })];
  assert.deepEqual(kinds(demoMoves(t, bids, addrs, 2000)), ["open", "reveal:rival-a:B1", "assess:B2"]);
  assert.equal(typeof demoTurn(t, bids, addrs, 2000, { move: "reveal", rival: "rival-b" }), "string", "B's bid is already open");
});

test("reviewing: assess what is unassessed, place what is compliant and unplaced, with the right hint", () => {
  const t = T({ leader: "B3" });
  const bids = [
    bid("B1", 1, A, 600, { mask: "MEETS,MISSES,MEETS" }),
    bid("B2", 2, B, 1000, { mask: "MEETS,MEETS,MEETS", compliant: true }),
    bid("B3", 3, ME, 800, { mask: "MEETS,MEETS,MEETS", compliant: true, placed: true }),
  ];
  const moves = demoMoves(t, bids, addrs, 2500);
  assert.deepEqual(kinds(moves), ["open", "place:B2"]);
  assert.equal(moves[1].after, "B3");
  assert.deepEqual(kinds(demoMoves(t, [...bids.slice(0, 2), { ...bids[2], mask: "" , compliant: false, placed: false }], addrs, 2500)), ["open", "assess:B3", "place:B2"]);
  assert.deepEqual(kinds(demoMoves(t, bids, addrs, 3000)).includes("assess:B1"), false, "after review_by nothing is assessed");
});

test("ready, awarded, closed", () => {
  assert.ok(kinds(demoMoves(T({ phase: "ready_to_award", award_ready: true }), [], addrs, 5000)).includes("award"));
  const awarded = T({ status: "awarded", phase: "awarded" });
  const bids = [bid("B1", 1, A, 600), bid("B2", 2, B, 1000, { bond_to: "credit" })];
  assert.deepEqual(kinds(demoMoves(awarded, bids, addrs, 6000)), ["open", "complete", "reclaim:B1"]);
  assert.deepEqual(kinds(demoMoves(T({ status: "paid", phase: "paid" }), bids, addrs, 6000)), ["open", "reclaim:B1"]);
  assert.match(String(demoTurn(T({}), [], addrs, 2500, { move: "award" })), /not ready/);
});

test("the demo windows fit the contract's doors and stay short", () => {
  const d = demoDeadlines(1000);
  assert.ok(d.bidBy - 1000 >= 600 + 120, "two minutes of slack over the contract's ten-minute floor");
  assert.ok(d.revealBy - d.bidBy >= 600 && d.reviewBy - d.revealBy >= 600 && d.completeBy - d.reviewBy >= 1200);
  assert.ok(DEMO_WINDOWS.bid + DEMO_WINDOWS.reveal + DEMO_WINDOWS.review <= 40 * 60);
});

test("the key is read forgivingly and derives the same three accounts", () => {
  const k = "ab".repeat(32);
  const one = deriveAll("0x" + k);
  assert.ok(one && /^0x[0-9a-f]{40}$/.test(one.buyer.address));
  assert.equal(new Set([one.buyer.address, one["rival-a"].address, one["rival-b"].address]).size, 3);
  for (const v of [k, ` "0x${k}" `, "0X" + k.toUpperCase(), `'${k}'`]) assert.deepEqual(deriveAll(v), one, v);
  assert.equal(keyProblem(""), NO_KEY);
  assert.equal(keyProblem("  "), NO_KEY);
  assert.equal(keyProblem("0x1234"), BAD_KEY);
  assert.equal(deriveAll("nope"), null);
});
