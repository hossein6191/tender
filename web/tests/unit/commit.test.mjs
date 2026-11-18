// The sealed bid as the contract checks it: the site's commitment against contracts/tender.py's own
// _commitment(), the fingerprint against _fingerprint(), and every salt the site or the demo clerk makes
// against _is_salt(); all asked of the contract itself.

import test from "node:test";
import assert from "node:assert/strict";

import { commitmentOf, fingerprintOf, newSalt, sealedProposal } from "../../lib/commit.ts";
import { RIVALS, VISITOR_CHIPS, rivalSalt } from "../../lib/demo-script.ts";
import { parseGen } from "../../lib/format.ts";
import { isSalt } from "../../lib/rules.ts";
import { askContract } from "./oracle.mjs";
import { REQS } from "./fixture.mjs";

test("the commitment is the contract's own _commitment(), for every demo bid and odd texts", () => {
  const cases = [
    ...RIVALS.map((r) => [r.priceAtto.toString(), r.proposal, "abcdefghijklmnop1234"]),
    ...VISITOR_CHIPS.map((c) => [parseGen(c.priceText).toString(), c.proposal, newSalt()]),
    ["1", "a proposal with | bars | and \"quotes\" and \\ backslashes, forty+", "Z".repeat(64)],
    ["999999999999999999999", "  leading and trailing spaces kept as sent, forty characters  ", "q".repeat(16)],
  ];
  const answer = askContract({ commitment: cases });
  assert.deepEqual(cases.map(([p, r, s]) => commitmentOf(p, r, s)), answer.commitment);
  assert.match(answer.commitment[0], /^[0-9a-f]{64}$/);
});

test("the price goes in as plain digits: no leading zero, no decimal point", () => {
  assert.equal(commitmentOf(800n * 10n ** 15n, "p", "s"), commitmentOf("800000000000000000", "p", "s"));
  assert.notEqual(commitmentOf(1n, "p", "s"), commitmentOf(10n, "p", "s"));
});

test("the proposal is trimmed once and committed exactly as it will be revealed", () => {
  assert.equal(sealedProposal("  We will paint.  "), "We will paint.");
  assert.notEqual(commitmentOf(1n, " x", "s".repeat(16)), commitmentOf(1n, "x", "s".repeat(16)));
});

test("every salt the browser makes, and every rival salt, is one the contract takes", () => {
  const made = Array.from({ length: 40 }, () => newSalt());
  assert.ok(made.every((s) => s.length === 32 && isSalt(s)));
  assert.equal(new Set(made).size, made.length);
  const k1 = "0x" + "11".repeat(32);
  const rivals = ["T1", "T2", "T99"].flatMap((t) => RIVALS.map((r) => rivalSalt(k1, t, r.key)));
  assert.equal(new Set(rivals).size, rivals.length, "a salt per tender and rival");
  assert.equal(rivalSalt(k1, "T1", "rival-a"), rivalSalt(k1, "T1", "rival-a"));
  assert.notEqual(rivalSalt(k1, "T1", "rival-a"), rivalSalt("0x" + "22".repeat(32), "T1", "rival-a"));
  assert.ok(askContract({ is_salt: [...made, ...rivals] }).is_salt.every(Boolean));
});

test("the fingerprint is the contract's own _fingerprint()", () => {
  const cases = [
    [REQS, RIVALS[0].proposal, "", ""],
    [REQS, RIVALS[1].proposal, "Standard acrylic emulsion is low in solvents, so it is low-VOC.", "bidder"],
    [["one \"quoted\" \\ req"], "a proposal", "a challenger's note", "challenger"],
  ];
  assert.deepEqual(cases.map((c) => fingerprintOf(...c)), askContract({ fingerprint: cases }).fingerprint);
});
