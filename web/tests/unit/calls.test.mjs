// Every call builder names a public write of contracts/tender.py and sends its arguments in its order.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { calls } from "../../lib/calls.ts";

const src = readFileSync(new URL("../../../contracts/tender.py", import.meta.url), "utf8");
const writes = new Map();
for (const m of src.matchAll(/@gl\.public\.write(\.payable)?\s+def (\w+)\(self(?:,\s*)?([^)]*)\)/g)) writes.set(m[2], { payable: !!m[1], args: m[3] ? m[3].split(",").map((a) => a.trim()).filter(Boolean).length : 0 });

test("each builder matches a write's name, arity and payability", () => {
  const built = [
    calls.deposit(1n), calls.withdraw(1n), calls.openTender("t", "s", ["a", "b"], 1n, 1, 2, 3, 4, 5n), calls.bid("T1", "ab", 1n), calls.reveal("B1", 5n, "p", "s"),
    calls.forfeit("B1"), calls.assess("B1"), calls.appeal("B1", "r"), calls.challenge("B1", "r"), calls.place("B1", ""), calls.reclaim("B1"), calls.award("T1"),
    calls.complete("T1"), calls.dispute("T1"), calls.waive("T1"), calls.claimPayment("T1"),
  ];
  for (const c of built) {
    const w = writes.get(c.fn);
    assert.ok(w, c.fn);
    assert.equal(c.args.length, w.args, c.fn);
    if (c.value !== undefined) assert.equal(w.payable, true, c.fn);
  }
  assert.equal(new Set(built.map((c) => c.fn)).size, writes.size, "every write has a builder");
  assert.deepEqual(calls.openTender("t", "s", ["a", "b"], 5n, 1, 2, 3, 4, 9n).args, ["t", "s", "a|b", "5", 1, 2, 3, 4]);
});
