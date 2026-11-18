// The site's copy of the contract's doors and of rules(), checked against contracts/tender.py itself.

import test from "node:test";
import assert from "node:assert/strict";

import { RULES_COPY } from "../../lib/contract-rules.ts";
import { DEMO_REQUIREMENTS, DEMO_SCOPE, DEMO_TITLE, RIVALS, VISITOR_CHIPS } from "../../lib/demo-script.ts";
import { MAX_BOND, MAX_BUDGET, MIN_BOND, MIN_BUDGET, SIZES, isSalt, requirementsOf, textProblem } from "../../lib/rules.ts";
import { askContract } from "./oracle.mjs";

test("the rules copy is rules(), word for word", () => {
  assert.deepEqual(RULES_COPY, askContract({ rules: true }).rules);
});

test("text doors answer as the contract's _text_problem()", () => {
  const texts = ["", "ab", "abc", "  abc  ", "a".repeat(80), "a".repeat(81), "tab\there", "new\nline", "café au lait", "x".repeat(39) + " ", "plain enough text here"];
  const cases = texts.flatMap((t) => [[t, 3, 80, "the title"], [t, 20, 400, "the reason"]]);
  assert.deepEqual(cases.map((c) => textProblem(...c)), askContract({ text_problem: cases }).text_problem);
});

test("the requirements door answers as _requirements_of()", () => {
  const cases = [DEMO_REQUIREMENTS.join("|"), "", "abcd", "one fine|two fine", "a|b|c|d|e|f|g", "fine one|  spaced two  ", Array(6).fill("r".repeat(160)).join("|"), "ok then|badé one"];
  assert.deepEqual(cases.map((c) => requirementsOf(c)), askContract({ requirements_of: cases }).requirements_of);
});

test("salts, sizes and amounts match the contract's constants", () => {
  const salts = ["", "a".repeat(15), "a".repeat(16), "a".repeat(64), "a".repeat(65), "abc-defghijklmnop", "ABCdef0123456789"];
  assert.deepEqual(salts.map(isSalt), askContract({ is_salt: salts }).is_salt);
  const c = askContract({ constants: ["MIN_BUDGET", "MAX_BUDGET", "MIN_BOND", "MAX_BOND", "MIN_PROPOSAL", "MAX_PROPOSAL", "MIN_REASON", "MAX_REASON", "APPEAL_SECONDS"] }).constants;
  assert.equal(BigInt(c.MIN_BUDGET), MIN_BUDGET);
  assert.equal(BigInt(c.MAX_BUDGET), MAX_BUDGET);
  assert.equal(BigInt(c.MIN_BOND), MIN_BOND);
  assert.equal(BigInt(c.MAX_BOND), MAX_BOND);
  assert.deepEqual([c.MIN_PROPOSAL, c.MAX_PROPOSAL, c.MIN_REASON, c.MAX_REASON], [...SIZES.proposal, ...SIZES.reason]);
  assert.equal(c.APPEAL_SECONDS, 1200);
});

test("every text the demo clerk or a chip will send passes the doors", () => {
  assert.equal(textProblem(DEMO_TITLE, 3, 80, "t"), "");
  assert.equal(textProblem(DEMO_SCOPE, 20, 600, "s"), "");
  for (const p of [...RIVALS.map((r) => r.proposal), ...VISITOR_CHIPS.map((x) => x.proposal)]) assert.equal(textProblem(p, 40, 1200, "p"), "", p);
});
