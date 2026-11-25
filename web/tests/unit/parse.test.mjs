// Rows as the contract writes them, mapped for the pages; and the mask as the bid board shows it, checked
// against the contract's own _meets_all(), _misses_any() and _clean_mask().

import test from "node:test";
import assert from "node:assert/strict";

import { mapBid, mapBidPage, mapCredit, mapMyPage, mapStats, mapTender, mapTenderPage, maskMarks, maskSummary, meetsAll, missesAny } from "../../lib/parse.ts";
import { askContract } from "./oracle.mjs";
import { A, B, BUYER, M, bidRow, tenderRow } from "./fixture.mjs";

test("a tender row maps whole, from JSON text or an object", () => {
  const t = mapTender(JSON.stringify(tenderRow({ winner: { bid: "B9", bidder: A.toUpperCase().replace("0X", "0x"), price: String(800n * M) } })));
  assert.equal(t.id, "T4");
  assert.equal(t.buyer, BUYER);
  assert.equal(t.budgetAtto, String(1200n * M));
  assert.deepEqual(t.requirements.length, 3);
  assert.equal(t.phase, "reviewing");
  assert.deepEqual(t.winner, { bid: "B9", bidder: A, priceAtto: String(800n * M) });
  assert.equal(mapTender({ error: "no tender T99" }), null);
  assert.equal(mapTender("not json"), null);
});

test("missing or malformed fields get safe defaults", () => {
  const t = mapTender({ tender: "T1", phase: "flying", status: 7, budget: "-5", bid_by: -1, leader: "X1" });
  assert.equal(t.phase, "bidding");
  assert.equal(t.status, "open");
  assert.equal(t.budgetAtto, "0");
  assert.equal(t.bidBy, 0);
  assert.equal(t.leader, "");
  assert.equal(t.winner, null);
  const b = mapBid({ bid: "B2", status: "weird", appeal: "maybe", price: "0012" });
  assert.equal(b.status, "committed");
  assert.equal(b.appeal, "");
  assert.equal(b.priceAtto, "12");
});

test("pages, credit and stats", () => {
  const p = mapBidPage({ tender: "T4", total: 2, offset: 0, limit: 20, rows: [bidRow("B1", 1, A, 600), bidRow("B2", 2, B, 1000), "junk"] });
  assert.equal(p.rows.length, 2);
  assert.equal(p.rows[1].bidder, B);
  assert.deepEqual(mapBidPage({ error: "no tender T9" }).rows, []);
  assert.throws(() => mapBidPage({ total: 1 }));
  assert.equal(mapTenderPage({ total: 1, rows: [{ tender: "T1", title: "x", status: "paid", budget: "5" }] }).rows[0].status, "paid");
  assert.equal(mapMyPage({ total: 1, rows: [{ tender: "T1", role: "buyer", bid: "" }] }).rows[0].role, "buyer");
  assert.equal(mapCredit('{"who":"0x","credit":"50"}'), "50");
  assert.equal(mapStats({ knocked_out: 2, balance_owed: "7" }).knockedOut, 2);
});

test("the mask is one mark per requirement, as the contract stores it", () => {
  assert.deepEqual(maskMarks("MEETS,MISSES,MEETS", 3), ["MEETS", "MISSES", "MEETS"]);
  assert.deepEqual(maskMarks("", 3), ["", "", ""]);
  assert.deepEqual(maskMarks("MEETS,MEETS", 3), ["UNCLEAR", "UNCLEAR", "UNCLEAR"]);
  assert.deepEqual(maskMarks("MEETS,maybe,MEETS", 3), ["UNCLEAR", "UNCLEAR", "UNCLEAR"]);
  const masks = [["MEETS,MEETS,MEETS", 3], ["MEETS,MISSES,MEETS", 3], ["MEETS,UNCLEAR", 2], ["MEETS", 1], ["MEETS,MEETS", 3], ["", 1], ["MISSES,MISSES", 2], ["meets", 1]];
  const c = askContract({ meets_all: masks, misses_any: masks.map((m) => m[0]), clean_mask: masks });
  assert.deepEqual(masks.map(([m, n]) => meetsAll(m, n)), c.meets_all);
  assert.deepEqual(masks.map(([m]) => missesAny(m)), c.misses_any);
  assert.deepEqual(masks.filter(([m]) => m).map(([m, n]) => maskMarks(m, n).join(",")), c.clean_mask.filter((_, i) => masks[i][0]));
});

test("the mask in words", () => {
  assert.equal(maskSummary("MEETS,MISSES,MEETS", 3), "misses requirement 2");
  assert.equal(maskSummary("MEETS,MEETS,MEETS", 3), "meets every requirement");
  assert.equal(maskSummary("MISSES,UNCLEAR,MISSES", 3), "misses requirements 1 and 3; unclear on requirement 2");
  assert.equal(maskSummary("", 3), "not assessed yet");
});

test("Studio v0.123: the execution result named on the transaction decides a refusal, the receipt only as a fallback", async () => {
  const { decodeTx } = await import("../../lib/rpc.ts");
  const body = Buffer.from('{"ok": true}').toString("base64");
  const tx = (named, leader) => ({ status: "FINALIZED", txExecutionResultName: named, consensus_data: { votes: { a: "agree", b: "agree", c: "agree" }, leader_receipt: [{ result: body, execution_result: leader }] } });
  assert.equal(decodeTx(tx("FINISHED_WITH_ERROR", "SUCCESS")).exec, "ERROR");
  assert.equal(decodeTx(tx("FINISHED_WITH_RETURN", "ERROR")).exec, "SUCCESS");
  assert.equal(decodeTx(tx(undefined, "ERROR")).exec, "ERROR");
});
