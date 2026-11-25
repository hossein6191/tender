/* Tender against GenLayer Studio (chain 61999, Studio v0.123, GenVM v0.4), with throwaway accounts. Deploys its own copy.
 *
 *   npm ci                                                  # genlayer-js 2.0.0, pinned by package-lock.json
 *   node tests/on_chain/smoke.mjs                           # the whole run, from a fresh state
 *   RESUME=1 node tests/on_chain/smoke.mjs                  # continue a run that was cut off
 *   STATE=/some/dir/run.json RESUME=1 node tests/on_chain/smoke.mjs   # the same, with the state kept elsewhere
 *
 * Studio v0.123 charges fees: every deploy and write carries the distribution and fee value quoted by
 * estimateTransactionFees(), and every transaction is checked for both its status (FINALIZED) and its execution
 * result (FINISHED_WITH_RETURN, or FINISHED_WITH_ERROR for a raised refusal). What a transaction cost its sender is
 * read from the transaction's own fee accounting (paid less refunded), so every balance is checked to the atto,
 * fees included.
 *
 * Five generated accounts play the story, known only by their roles: BUYER is a primary school that wants its
 * twelve classrooms repainted; CHEAP, MIDDLE and DEAR are three painters; STRANGER bids over the budget, bids
 * late, and tries what it may not.
 *
 *   1  deploy Tender.
 *   2  BUYER opens with 0.05 GEN, under the 0.1 GEN floor, and is refused with every atto returned. BUYER opens
 *      T1, "Repaint Elm Street Primary classrooms", with a 1.2 GEN budget, a 0.05 GEN bid bond and three
 *      requirements: "Paints all 12 classrooms", "Uses low-VOC paint", "Finishes within the summer break".
 *      Bidding closes 25 minutes later, reveals 20 minutes after that, review 30 minutes after that.
 *   3  sealed bids. CHEAP commits 0.6 GEN with the bond sent; MIDDLE deposits 0.05 GEN of credit and commits
 *      0.8 GEN from it; DEAR commits 1.0 GEN with the bond sent; STRANGER commits 1.5 GEN. BUYER tries to bid on
 *      its own tender: refused, the bond returned. No model runs in any of these.
 *   4  bidding closes on the chain's clock. STRANGER bids late: refused, the bond returned.
 *   5  reveals. CHEAP reveals with the wrong salt: refused. CHEAP reveals again, correctly. MIDDLE and DEAR
 *      reveal; their bonds stay held until the award. STRANGER reveals 1.5 GEN: recorded as over_budget, which
 *      cannot win, and its bond is back in credit at once.
 *   6  reveals close. STRANGER tries to award T1: refused, three revealed bids are not assessed yet.
 *   7  three consensus rounds, one bid each, both orders. CHEAP's proposal says "standard acrylic emulsion" and
 *      nothing about low-VOC paint: MEETS,MISSES,MEETS. MIDDLE and DEAR: MEETS,MEETS,MEETS. MIDDLE goes to the
 *      head of the ordered list; STRANGER places DEAR after it, and a wrong hint (DEAR at the head) is refused.
 *   8  each second look goes in right after the assessment that opens its twenty-minute window. CHEAP appeals
 *      once: the same questions with its reason as a BIDDER_NOTE, which the prompt says does not count as part
 *      of the proposal. Upheld: the bond goes to BUYER. DEAR challenges MIDDLE, the leader: the same questions
 *      with its reason as a CHALLENGER_NOTE. Upheld: no requirement reads MISSES, MIDDLE keeps the lead and
 *      DEAR's bond goes to MIDDLE's credit. (CHEAP and DEAR deposit these bonds during step 3.)
 *   9  the appeal window passes and STRANGER awards T1: MIDDLE wins at 0.8 GEN, the cheapest bid that meets every
 *      requirement, and 0.4 GEN goes back to BUYER in the same call. BUYER releases the 0.8 GEN to MIDDLE.
 *      STRANGER reclaims the three held bonds to their bidders' credit, and every bidder withdraws its credit.
 *  10  the views read back, the code deployed compared with the file byte for byte, the contract's balance
 *      read, and every account's net movement checked against what the receipts say.
 *
 * Every refusal is a signed transaction. Balances are read after finalisation, because a transfer lands at
 * FINALIZED, not at ACCEPTED. Transactions are polled with eth_getTransactionByHash, never with views. A round
 * no majority carried stores nothing and, since assess() and appeal() carry no value, strands nothing; it is
 * sent again and both transactions are kept. Every step is saved as it is made, so a run cut off part way
 * continues without sending anything twice. Every id (T1, B1 to B4, the contract address) is read from the
 * receipt that created it, never assumed. Waits are measured on the chain's own clock: the tender and stats
 * views report the message clock as `now`. A whole run takes about 70 to 100 minutes, most of it the windows:
 * one deployment and 36 transactions, five of them consensus rounds of two askings each.
 *
 * A state file remembers the sha256 of the contract it deployed, and a RESUME against a state made from
 * another file stops before sending anything.
 */
import { createClient, createAccount, generatePrivateKey } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { getAddress } from "viem";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const RPC = "https://studio.genlayer.com/api";
const STATE = process.env.STATE || join(tmpdir(), "tender-smoke-state.json");
const RECORD = process.env.RECORD || STATE.replace(/\.json$/, "") + "-record.json";
const FILE = new URL("../../contracts/tender.py", import.meta.url);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = () => new Date().toISOString().slice(11, 19);
const rpc = async (m, p) => {
  let last;
  for (let i = 0; i < 90; i++) {
    try {
      const r = await fetch(RPC, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p }) });
      const j = await r.json();
      if (j.error && (j.error.code === -32029 || j.error.code === -32429 || r.status === 429)) { await sleep(((j.error.data?.retry_after_seconds) || 20) * 1000); continue; }
      if (j.error) { last = new Error(m + ": " + JSON.stringify(j.error).slice(0, 200)); await sleep(6000); continue; }
      return j.result;
    } catch (e) { last = e; await sleep(4000); }
  }
  throw last;
};
let pass = 0, fail = 0;
const ok = (n, c, d = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  - " + d : ""}`); return !!c; };
const GEN = 10n ** 18n;
const tally = (v) => `${v.agree} agree, ${v.disagree} disagree, ${v.idle} idle`;
const sha = (b) => createHash("sha256").update(b).digest("hex");
const need = (v, what) => { if (!v) { console.log(`stopping: ${what} was not in the receipt; nothing is assumed`); process.exit(2); } return v; };

// ---------- state: keys, addresses and every step already made survive a cut-off run ----------
const st = existsSync(STATE) && process.env.RESUME ? JSON.parse(readFileSync(STATE, "utf8")) : {};
st.keys = st.keys || {}; st.steps = st.steps || {}; st.views = st.views || {}; st.order = st.order || []; st.ids = st.ids || {}; st.when = st.when || {}; st.fees = st.fees || {};
const SOURCE_SHA = sha(readFileSync(FILE));
if (st.source_sha256 && st.source_sha256 !== SOURCE_SHA) {
  console.log(`the state file ${STATE} belongs to a run of another contract file; start a fresh run without RESUME, or name another STATE`);
  process.exit(2);
}
st.source_sha256 = SOURCE_SHA;
// 32 hexadecimal characters each, letters and digits only; every one is revealed on chain with its bid
st.salts = st.salts || { cheap: randomBytes(16).toString("hex"), middle: randomBytes(16).toString("hex"), dear: randomBytes(16).toString("hex"), stranger: randomBytes(16).toString("hex") };
const save = () => {
  writeFileSync(STATE, JSON.stringify(st, null, 1));
  const { keys, ...shown } = st;     // the record carries no key
  writeFileSync(RECORD, JSON.stringify(shown, null, 1));
};
const ROLES = {
  buyer: "a primary school; opens the classroom tender, is refused a bid on it, releases the payment",
  cheap: "the cheapest painter, whose proposal never commits to low-VOC paint; appeals once",
  middle: "a painter whose proposal meets every requirement; bids from credit",
  dear: "the dearest painter, whose proposal also meets every requirement; challenges the leader once",
  stranger: "bids over the budget and after the deadline, assesses, places, awards, reclaims, tries to release the payment",
};
const acct = {}, client = {};
for (const k of Object.keys(ROLES)) st.keys[k] = st.keys[k] || generatePrivateKey();
for (const k of Object.keys(ROLES)) { acct[k] = createAccount(st.keys[k]); client[k] = createClient({ chain: studionet, account: acct[k] }); }
const rd = createClient({ chain: studionet });
st.accounts = Object.fromEntries(Object.keys(ROLES).map((k) => [k, getAddress(acct[k].address)]));
const low = (a) => String(a).toLowerCase();
save();

const balance = async (a) => BigInt(await rpc("eth_getBalance", [a, "latest"]) || "0x0");
const nonceOf = async (a) => Number(BigInt(await rpc("eth_getTransactionCount", [a, "latest"]) || "0x0"));
const fundOnce = async (k, whole) => {
  st.funded = st.funded || {};
  if (st.funded[k]) return;
  await rpc("sim_fundAccount", { account_address: getAddress(acct[k].address), amount: whole * 1e18 });   // checksummed; amount in atto, as a number
  for (let i = 0; i < 20 && (await balance(acct[k].address)) === 0n; i++) await sleep(3000);
  st.funded[k] = String(await balance(acct[k].address)); save();
};

// ---------- fees: quoted before every transaction, and read back from every transaction ----------
// estimateTransactionFeesForWrite fails on Studio ("fee below_minimum"); the generic quote works. The time-unit
// allocations are raised to the policy's maximum so a round of six model calls fits; the unused part comes back.
const quote = async (who) => {
  for (let i = 0; ; i++) {
    try {
      const q = await client[who].estimateTransactionFees({ leaderTimeunitsAllocation: 600n, validatorTimeunitsAllocation: 600n });
      if (!q?.policy?.enabled || !q?.distribution || !(q.feeValue > 0n)) throw new Error("no usable fee quote: " + JSON.stringify(q, (k, v) => (typeof v === "bigint" ? String(v) : v)).slice(0, 200));
      return { distribution: q.distribution, feeValue: q.feeValue };
    } catch (e) { if (i >= 8) throw e; await sleep(10000); }
  }
};
// what a transaction cost its sender: paid less refunded, once the fee accounting is settled
const feeOf = async (tx) => {
  for (let i = 0; i < 30; i++) {
    const t = await rpc("eth_getTransactionByHash", [tx]);
    const fa = t?.data?.fee_accounting;
    if (fa && fa.status === "settled" && fa.paid_fee_value !== undefined) return BigInt(fa.paid_fee_value) - BigInt(fa.total_refunded || 0);
    await sleep(4000);
  }
  return null;
};
const addFee = (who, fee) => { st.fees[who] = String(BigInt(st.fees[who] || "0") + (fee ?? 0n)); };

// ---------- transactions ----------
const errText = (e) => String(e?.details || e?.shortMessage || e?.cause?.message || e?.message || e);
// A request the network refused or never received is made again. When the failure is ambiguous the
// sender's nonce says whether the transaction landed after all, and its hash is read back, so nothing is
// ever sent twice.
const sendRaw = async (who, what, make) => {
  const addr = acct[who].address;
  for (let i = 0; ; i++) {
    const n0 = await nonceOf(addr);
    try { return await make(); } catch (e) {
      if (i >= 8) throw e;
      console.log(`      ${what} was not taken (${errText(e).slice(0, 70)}); looking again in 20s`);
      await sleep(20000);
      if ((await nonceOf(addr)) > n0) {
        const list = await rpc("sim_getTransactionsForAddress", [addr]);
        const hit = (list || []).find((t) => low(t.from_address) === low(addr) && Number(t.nonce) === n0);
        if (hit?.hash) return hit.hash;
        throw new Error(what + " landed but its hash could not be read back");
      }
    }
  }
};
const countVotes = (t) => { let a = 0, d = 0, idl = 0; for (const k in (t.consensus_data?.votes || {})) { const v = t.consensus_data.votes[k]; if (v === "agree") a++; else if (v === "disagree") d++; else idl++; } return { agree: a, disagree: d, idle: idl }; };
const wait = async (tx) => {
  let stuck = 0;
  for (let i = 0; i < 900; i++) {
    await sleep(4000);
    const t = await rpc("eth_getTransactionByHash", [tx]);
    if (t?.status === "FINALIZED") {
      const lr = t.consensus_data?.leader_receipt, one = Array.isArray(lr) ? lr[0] : lr;
      let msg = "";
      try { msg = Buffer.from(one.result, "base64").toString("utf8").replace(/[^\x20-\x7e]/g, " ").trim(); } catch (e) {}
      const v = countVotes(t);
      return { tx, msg, status: t.status, exec: t.txExecutionResultName || "", leader: one?.execution_result || "", votes: v, applied: t.result_name === "MAJORITY_AGREE" || v.agree * 2 > v.agree + v.disagree + v.idle, address: t.data?.contract_address || t.to_address || "" };
    }
    // a round no majority carried is final as it stands once it has been left alone for ten minutes
    if (t?.status === "UNDETERMINED" && (stuck = stuck + 1) > 150) return { tx, msg: "UNDETERMINED", status: t.status, exec: "", leader: "", votes: countVotes(t), applied: false, address: "" };
    if (t?.status === "CANCELED") return { tx, msg: "CANCELED", status: t.status, exec: "", leader: "", votes: { agree: 0, disagree: 0, idle: 0 }, applied: false, address: "" };
    if (i > 0 && i % 75 === 0) console.log(`      [${stamp()}] still ${t?.status || "unknown"} after ${Math.round(i * 4 / 60)} minutes: ${tx}`);
  }
  return { tx, msg: "TIMEOUT", status: "TIMEOUT", exec: "", leader: "", votes: { agree: 0, disagree: 0, idle: 0 }, applied: false, address: "" };
};
const jsonOf = (msg) => { const b = String(msg).indexOf("{"); if (b === -1) return null; try { return JSON.parse(String(msg).slice(b)); } catch (e) { return null; } };
const settle = async (a, before, want) => { for (let i = 0; i < 45; i++) { const b = await balance(a); if (b - before === want) return b; await sleep(4000); } return await balance(a); };

// One step: a signed transaction with quoted fees, its status, execution result and tally, what it returned, what
// it cost its sender, and the balances it moved. opt.watch names the roles whose balances are read before and
// after, opt.expect the change each should show apart from fees (a table, or a function of what the call
// returned): the sender's own fee for every try is subtracted from its line. opt.again is how long to wait
// before sending a refused step again.
const call = async (id, who, fn, args = [], opt = {}) => {
  if (!st.steps[id]) { st.steps[id] = { id, who, fn, args: args.map(String), value: String(opt.value || 0n), tries: [] }; st.order.push(id); }
  const rec = st.steps[id];
  if (!rec.done) {
    if (!rec.before) { rec.before = {}; for (const k of opt.watch || []) rec.before[k] = String(await balance(acct[k].address)); save(); }
    for (;;) {
      if (!rec.pending) {
        const fees = await quote(who);
        rec.pending = await sendRaw(who, fn, () => client[who].writeContract({ address: need(st.contract, "the contract address"), functionName: fn, args, fees, ...(opt.value ? { value: opt.value } : {}) }));
        save();
      }
      const r = await wait(rec.pending);
      const fee = await feeOf(r.tx);
      addFee(who, fee);
      rec.tries.push({ tx: r.tx, status: r.status, exec: r.exec, leader: r.leader, votes: r.votes, applied: r.applied, fee: fee === null ? null : String(fee), msg: r.msg });
      rec.pending = null; save();
      console.log(`      [${stamp()}] ${who.toUpperCase()} ${fn}(${args.map((x) => String(x).slice(0, 22)).join(", ")})${opt.value ? " +" + Number(opt.value) / 1e18 + " GEN" : ""}  ${r.tx}  ${r.status} ${r.exec}  ${tally(r.votes)}  fee ${fee}`);
      if (r.msg === "TIMEOUT" || rec.tries.length >= 4) break;
      if (!r.applied) { console.log("      the validators did not carry that round (" + tally(r.votes) + "), so nothing was stored; sending it again"); continue; }
      const again = opt.again ? opt.again(r) : 0;
      if (again > 0) { console.log(`      not yet; waiting ${Math.round(again / 1000)} s and sending it again`); await sleep(again); continue; }
      break;
    }
    const last = rec.tries[rec.tries.length - 1];
    const expect = typeof opt.expect === "function" ? opt.expect(jsonOf(last.msg)) : opt.expect;
    const spent = rec.tries.reduce((n, t) => n + BigInt(t.fee || "0"), 0n);
    rec.spent = String(spent);
    rec.after = {}; rec.delta = {};
    for (const k of opt.watch || []) {
      const before = BigInt(rec.before[k]);
      const want = expect && expect[k] !== undefined ? BigInt(expect[k]) - (k === who ? spent : 0n) : null;
      const now = want === null ? await balance(acct[k].address) : await settle(acct[k].address, before, want);
      rec.after[k] = String(now); rec.delta[k] = String(now - before);
    }
    rec.done = true; save();
  }
  const last = rec.tries[rec.tries.length - 1];
  return { ...last, j: jsonOf(last.msg), tries: rec.tries, delta: rec.delta || {}, spent: BigInt(rec.spent || "0"), who: rec.who };
};
const refused = (r, words) => r.status === "FINALIZED" && r.exec === "FINISHED_WITH_ERROR" && r.msg.includes(words);
// the balance moved by the expected amount, less what the step's own transactions cost when the role sent them
const moved = (r, k, want) => r.delta[k] === String(BigInt(want) - (k === r.who ? r.spent : 0n));
const votes = (r) => r.tries.map((t) => tally(t.votes)).join(", then ");

const deploy = async (id, who) => {
  if (!st.steps[id]) { st.steps[id] = { id, who, fn: "deploy contracts/tender.py", args: [], value: "0", tries: [] }; st.order.push(id); }
  const rec = st.steps[id];
  if (!rec.done) {
    const code = readFileSync(FILE, "utf8");
    for (;;) {
      if (!rec.pending) { const fees = await quote(who); rec.pending = await sendRaw(who, "deploy", () => client[who].deployContract({ code, args: [], leaderOnly: false, fees })); save(); }
      const r = await wait(rec.pending);
      const fee = await feeOf(r.tx);
      addFee(who, fee);
      rec.tries.push({ tx: r.tx, status: r.status, exec: r.exec, leader: r.leader, votes: r.votes, applied: r.applied, fee: fee === null ? null : String(fee), msg: r.msg.slice(0, 300) });
      rec.address = r.address; rec.pending = null; save();
      console.log(`      [${stamp()}] ${who.toUpperCase()} deploy  ${r.tx}  ${r.status} ${r.exec}  ${tally(r.votes)}  fee ${fee}  ${r.address}`);
      if (r.applied || r.msg === "TIMEOUT" || rec.tries.length >= 3) break;
    }
    rec.done = true; save();
  }
  return need(rec.address, "the address of the deployed contract");
};

// ---------- reads: paced, and made again on a 429 instead of failing ----------
let lastRead = 0;
const read = async (fn, args = []) => {
  for (let i = 0; i < 30; i++) {
    const gap = 3500 - (Date.now() - lastRead);
    if (gap > 0) await sleep(gap);
    lastRead = Date.now();
    try { return JSON.parse(String(await rd.readContract({ address: st.contract, functionName: fn, args }))); } catch (e) {
      if (i === 29) return { error: "VIEW ERROR " + fn + ": " + errText(e).slice(0, 100) };
      await sleep(/rate|429|limit/i.test(errText(e)) ? 25000 : 10000);
    }
  }
};
// a view read once for a check is kept with the run, so a continued run checks what was seen then
const seen = async (id, fn, args = []) => { if (!st.views[id]) { st.views[id] = { fn, args, when: stamp(), out: await read(fn, args) }; save(); } return st.views[id].out; };
// the chain's own clock: the stats view reports the message clock as `now`, and this machine's clock stands in
// only when a read carries none
const chainNow = async () => { const s = await read("stats", []); return Number(s.now > 0 ? s.now : Math.floor(Date.now() / 1000)); };
// an instant fixed once, the first time a step needs it, so a continued run sends the same arguments
const fixed = async (id, ahead) => { if (!st.when[id]) { st.when[id] = (await chainNow()) + ahead; save(); } return st.when[id]; };
// wait, by the chain's own clock, until an instant has passed
const untilPast = async (instant, what) => {
  for (let i = 0; i < 40; i++) {
    const left = Number(instant) - (await chainNow());
    if (left < -10) return;
    console.log(`      [${stamp()}] waiting ${left + 20} s, by the chain clock, for ${what}`);
    await sleep((left + 20) * 1000);
  }
};
const notYet = (r) => { const m = /open for another (\d+) seconds/.exec(r.msg); return r.exec === "FINISHED_WITH_ERROR" && m ? (Number(m[1]) + 15) * 1000 : 0; };

// ---------- the demonstration ----------
const BUDGET = GEN * 6n / 5n, BOND = GEN / 20n, SHORT = GEN / 20n;
const P_CHEAP_PRICE = GEN * 6n / 10n, P_MIDDLE_PRICE = GEN * 8n / 10n, P_DEAR_PRICE = GEN, P_OVER_PRICE = GEN * 3n / 2n;
const TITLE = "Repaint Elm Street Primary classrooms";
const SCOPE = "Repaint the walls and ceilings of the twelve classrooms at Elm Street Primary School.";
const REQS = ["Paints all 12 classrooms", "Uses low-VOC paint", "Finishes within the summer break"];
const P_CHEAP = "We will paint all 12 classrooms, walls and ceilings, with two coats of standard acrylic emulsion, and finish within the summer break, between 21 July and 29 August.";
const P_MIDDLE = "We will paint all 12 classrooms, walls and ceilings, using only low-VOC water-based paint, and finish the whole job within the summer break, by 29 August.";
const P_DEAR = "Our crew will repaint all 12 classrooms with low-VOC certified paint, two coats on walls and ceilings, starting 21 July and finishing within the summer break.";
const P_OVER = "We will paint all 12 classrooms with low-VOC paint and finish within the summer break, with a five-year guarantee.";
const REASON = "Standard acrylic emulsion is low in solvents, so the paint we name is low-VOC paint.";
const CHALLENGE = "Water-based paint is not always low-VOC, so this proposal never commits to requirement 2.";
const commitment = (price, proposal, salt) => sha(`${price}|${proposal}|${salt}`);
const bidderOf = {};   // bid id -> the role that made it, read off the bid receipts

await fundOnce("buyer", 3); for (const k of ["cheap", "middle", "dear", "stranger"]) await fundOnce(k, 1);
if (!st.start) { st.start = {}; for (const k of Object.keys(ROLES)) st.start[k] = String(await balance(acct[k].address)); st.started = new Date().toISOString(); save(); }
console.log(`[${stamp()}] ${Object.keys(ROLES).map((k) => k.toUpperCase().padEnd(9) + " " + st.accounts[k] + "  " + ROLES[k]).join("\n           ")}\n           state ${STATE}`);

// ================================================================ 1
console.log(`\n[${stamp()}] ---- 1: deploy`);
st.contract = st.contract || await deploy("deploy", "buyer");
save();
console.log(`      Tender at ${st.contract}`);
{
  const d = st.steps.deploy.tries.at(-1);
  ok(`BUYER deploys contracts/tender.py on GenVM v0.4 with quoted fees: ${d.status}, ${d.exec}, fee ${d.fee} atto`, d.status === "FINALIZED" && d.exec === "FINISHED_WITH_RETURN" && /^0x[0-9a-fA-F]{40}$/.test(st.contract), tally(d.votes));
  const s = await seen("statsEmpty", "stats", []);
  ok("Tender is deployed and holds nothing yet", s.tenders === 0 && s.balance_owed === "0", JSON.stringify(s));
}

// ================================================================ 2
console.log(`\n[${stamp()}] ---- 2: a refused tender, then the classroom tender`);
const bidBy = await fixed("bid_by", 1500), revealBy = bidBy + 1200, reviewBy = revealBy + 1800, completeBy = reviewBy + 3600;
let T1;
{
  const r = await call("open_short", "buyer", "open_tender", [TITLE, SCOPE, REQS.join("|"), String(BOND), bidBy, revealBy, reviewBy, completeBy], { value: SHORT, watch: ["buyer"], expect: { buyer: 0n } });
  ok("BUYER opens with 0.05 GEN, under the 0.1 GEN floor: refused and every atto returned", r.j?.ok === false && String(r.j?.reason).includes("send the maximum budget") && r.j?.returned === String(SHORT) && moved(r, "buyer", 0n), votes(r));
  const o = await call("open", "buyer", "open_tender", [TITLE, SCOPE, REQS.join("|"), String(BOND), bidBy, revealBy, reviewBy, completeBy], { value: BUDGET, watch: ["buyer"], expect: { buyer: -BUDGET } });
  T1 = need(o.j?.tender, "the tender id");
  ok(`BUYER opens ${T1} with a 1.2 GEN budget held in escrow and three requirements; no model runs`, o.j?.ok === true && o.j?.requirements === 3 && moved(o, "buyer", -BUDGET), votes(o));
}

// ================================================================ 3
console.log(`\n[${stamp()}] ---- 3: four sealed bids, and the buyer refused`);
const bids = {};
{
  const c1 = await call("bid_cheap", "cheap", "bid", [T1, commitment(P_CHEAP_PRICE, P_CHEAP, st.salts.cheap)], { value: BOND, watch: ["cheap"], expect: { cheap: -BOND } });
  bids.cheap = need(c1.j?.bid, "CHEAP's bid id"); bidderOf[bids.cheap] = "cheap";
  ok(`CHEAP commits a sealed bid, ${bids.cheap}, staking the 0.05 GEN bond with the call`, c1.j?.ok === true && c1.j?.from_credit === false && moved(c1, "cheap", -BOND), votes(c1));
  const d = await call("deposit_middle", "middle", "deposit", [], { value: BOND, watch: ["middle"], expect: { middle: -BOND } });
  ok("MIDDLE deposits 0.05 GEN of credit", d.j?.ok === true && d.j?.credit === String(BOND), votes(d));
  const c2 = await call("bid_middle", "middle", "bid", [T1, commitment(P_MIDDLE_PRICE, P_MIDDLE, st.salts.middle)], { watch: ["middle"], expect: { middle: 0n } });
  bids.middle = need(c2.j?.bid, "MIDDLE's bid id"); bidderOf[bids.middle] = "middle";
  ok(`MIDDLE commits ${bids.middle} with the bond taken from credit`, c2.j?.ok === true && c2.j?.from_credit === true && moved(c2, "middle", 0n), votes(c2));
  const c3 = await call("bid_dear", "dear", "bid", [T1, commitment(P_DEAR_PRICE, P_DEAR, st.salts.dear)], { value: BOND, watch: ["dear"], expect: { dear: -BOND } });
  bids.dear = need(c3.j?.bid, "DEAR's bid id"); bidderOf[bids.dear] = "dear";
  ok(`DEAR commits ${bids.dear}`, c3.j?.ok === true && moved(c3, "dear", -BOND), votes(c3));
  const c4 = await call("bid_stranger", "stranger", "bid", [T1, commitment(P_OVER_PRICE, P_OVER, st.salts.stranger)], { value: BOND, watch: ["stranger"], expect: { stranger: -BOND } });
  bids.stranger = need(c4.j?.bid, "STRANGER's bid id"); bidderOf[bids.stranger] = "stranger";
  ok(`STRANGER commits ${bids.stranger}; its price is sealed, so nobody can tell yet that it is over the budget`, c4.j?.ok === true, votes(c4));
  for (const who of ["cheap", "dear"]) {
    const e = await call("deposit_" + who, who, "deposit", [], { value: BOND, watch: [who], expect: { [who]: -BOND } });
    ok(`${who.toUpperCase()} deposits 0.05 GEN of credit, ready for an appeal or a challenge bond`, e.j?.ok === true && moved(e, who, -BOND), votes(e));
  }
  const b = await call("bid_buyer", "buyer", "bid", [T1, commitment(1n, P_CHEAP, st.salts.cheap)], { value: BOND, watch: ["buyer"], expect: { buyer: 0n } });
  ok("BUYER tries to bid on its own tender: refused, recorded, and the bond returned", b.j?.ok === false && String(b.j?.reason).includes("may not bid on it") && moved(b, "buyer", 0n), votes(b));
}

// ================================================================ 4
console.log(`\n[${stamp()}] ---- 4: bidding closes`);
await untilPast(bidBy, "bidding to close");
{
  const l = await call("bid_late", "stranger", "bid", [T1, commitment(1n, P_OVER, st.salts.stranger + "x")], { value: BOND, watch: ["stranger"], expect: { stranger: 0n } });
  ok("STRANGER bids after the bidding deadline: refused and the bond returned", l.j?.ok === false && String(l.j?.reason).includes("closed at") && moved(l, "stranger", 0n), votes(l));
}

// ================================================================ 5
console.log(`\n[${stamp()}] ---- 5: reveals`);
{
  const w = await call("reveal_wrong", "cheap", "reveal", [bids.cheap, String(P_CHEAP_PRICE), P_CHEAP, st.salts.middle]);
  ok("CHEAP reveals with the wrong salt: refused, nothing stored", refused(w, "do not match the commitment"), w.msg.slice(0, 120));
  for (const [who, price, text] of [["cheap", P_CHEAP_PRICE, P_CHEAP], ["middle", P_MIDDLE_PRICE, P_MIDDLE], ["dear", P_DEAR_PRICE, P_DEAR]]) {
    const r = await call("reveal_" + who, who, "reveal", [bids[who], String(price), text, st.salts[who]]);
    ok(`${who.toUpperCase()} reveals ${bids[who]} at ${Number(price) / 1e18} GEN; its bond stays held until the award`, r.j?.ok === true && r.j?.status === "revealed" && r.j?.bond_held_until === "the tender is decided", votes(r));
  }
  const o = await call("reveal_over", "stranger", "reveal", [bids.stranger, String(P_OVER_PRICE), P_OVER, st.salts.stranger]);
  ok(`STRANGER reveals ${bids.stranger} at 1.5 GEN: recorded as over_budget, so it cannot win`, o.j?.ok === false && o.j?.status === "over_budget" && String(o.j?.reason).includes("over the budget"), votes(o));
}

// ================================================================ 6
console.log(`\n[${stamp()}] ---- 6: the award before the assessments`);
await untilPast(revealBy, "reveals to close");
{
  const a = await call("award_early", "stranger", "award", [T1]);
  ok("STRANGER tries to award T1 before any bid is assessed: refused", refused(a, "are not assessed yet"), a.msg.slice(0, 140));
}

// ================================================================ 7
console.log(`\n[${stamp()}] ---- 7: three assessments, one bid per transaction, both orders; one appeal, one challenge`);
const masks = {};
{
  const a = await call("assess_cheap", "stranger", "assess", [bids.cheap]);
  masks.cheap = a.j?.mask;
  ok("CHEAP reads MEETS,MISSES,MEETS: it never commits to low-VOC paint", masks.cheap === "MEETS,MISSES,MEETS", `${masks.cheap} (${votes(a)})`);
  // the appeal right away, inside CHEAP's twenty-minute window
  const r = await call("appeal_cheap", "cheap", "appeal", [bids.cheap, REASON], { watch: ["cheap", "buyer"], expect: (j) => j?.appeal === "upheld" ? { cheap: 0n, buyer: BOND } : { cheap: 0n, buyer: 0n } });
  ok("CHEAP's appeal is upheld: the reason is not part of the proposal, and the 0.05 GEN appeal bond reaches BUYER from CHEAP's credit", r.j?.appeal === "upheld" && r.j?.bond_to === "buyer" && moved(r, "buyer", BOND), `${r.j?.appeal} ${r.j?.appeal_mask} (${votes(r)})`);
  const b = await call("assess_middle", "stranger", "assess", [bids.middle]);
  masks.middle = b.j?.mask;
  ok("MIDDLE reads MEETS,MEETS,MEETS and goes to the head of the ordered list", masks.middle === "MEETS,MEETS,MEETS" && b.j?.placed === true && b.j?.leader === bids.middle, `${masks.middle} (${votes(b)})`);
  // the challenge right away, inside MIDDLE's twenty-minute window
  const c = await call("challenge_middle", "dear", "challenge", [bids.middle, CHALLENGE]);
  ok("DEAR's challenge of MIDDLE is upheld: no requirement reads MISSES, MIDDLE keeps the lead, and DEAR's 0.05 GEN bond goes to MIDDLE's credit", c.j?.challenge === "upheld" && c.j?.bond_to === "bidder" && c.j?.leader === bids.middle && c.j?.credit === "0", `${c.j?.challenge} ${c.j?.challenge_mask} (${votes(c)})`);
  const m = await read("credit", [acct.middle.address]);
  ok("MIDDLE's credit now holds DEAR's challenge bond", m.credit === String(BOND), JSON.stringify(m));
  const d = await call("assess_dear", "stranger", "assess", [bids.dear]);
  masks.dear = d.j?.mask;
  ok("DEAR reads MEETS,MEETS,MEETS; dearer than the leader, it waits to be placed", masks.dear === "MEETS,MEETS,MEETS" && d.j?.placed === false, `${masks.dear} (${votes(d)})`);
  const w = await call("place_wrong", "stranger", "place", [bids.dear, ""]);
  ok("STRANGER tries to place DEAR at the head, ahead of the cheaper MIDDLE: refused", refused(w, "does not come before the leader"), w.msg.slice(0, 120));
  const p = await call("place_dear", "stranger", "place", [bids.dear, bids.middle]);
  ok("STRANGER places DEAR after MIDDLE; the contract checks both neighbours; MIDDLE leads", p.j?.ok === true && p.j?.leader === bids.middle && p.j?.placed === 2, votes(p));
}

// ================================================================ 9
console.log(`\n[${stamp()}] ---- 9: the award and the payment`);
{
  const t = await read("tender", [T1]);
  await untilPast(t.appeal_until, "the appeal window to close");
  const a = await call("award", "stranger", "award", [T1], { watch: ["buyer"], expect: { buyer: BUDGET - P_MIDDLE_PRICE } });
  ok(`STRANGER awards T1: MIDDLE's ${bids.middle} wins at 0.8 GEN and 0.4 GEN goes back to BUYER in the same call`, a.j?.winner === bids.middle && a.j?.price === String(P_MIDDLE_PRICE) && moved(a, "buyer", BUDGET - P_MIDDLE_PRICE), votes(a));
  const n = await call("complete_stranger", "stranger", "complete", [T1]);
  ok("STRANGER tries to release the payment: refused, only the buyer", refused(n, "only the buyer"), n.msg.slice(0, 100));
  const c = await call("complete", "buyer", "complete", [T1], { watch: ["middle"], expect: { middle: P_MIDDLE_PRICE } });
  ok("BUYER releases the 0.8 GEN to MIDDLE", c.j?.status === "paid" && moved(c, "middle", P_MIDDLE_PRICE), votes(c));
  const early = await call("reclaim_none", "stranger", "reclaim", [bids.stranger]);
  ok("STRANGER tries to reclaim its over-budget bid's bond again: refused, it went back to credit at the reveal", refused(early, "holds no bond to reclaim"), early.msg.slice(0, 100));
  for (const who of ["cheap", "middle", "dear"]) {
    const r = await call("reclaim_" + who, "stranger", "reclaim", [bids[who]]);
    ok(`STRANGER reclaims ${bids[who]}: its 0.05 GEN bond goes to ${who.toUpperCase()}'s credit`, r.j?.ok === true && r.j?.bond === String(BOND), votes(r));
  }
  for (const [who, amount] of [["cheap", BOND], ["middle", 2n * BOND], ["dear", BOND], ["stranger", BOND]]) {
    const w = await call("withdraw_" + who, who, "withdraw", [String(amount)], { watch: [who], expect: { [who]: amount } });
    ok(`${who.toUpperCase()} withdraws ${Number(amount) / 1e18} GEN of credit`, w.j?.ok === true && moved(w, who, amount), votes(w));
  }
}

// ================================================================ 10
console.log(`\n[${stamp()}] ---- 10: views, code and money`);
{
  const t = await seen("tender_end", "tender", [T1]);
  ok("tender(T1): paid, four bids, three eligible, one over budget, three assessed, two compliant, one appeal, one challenge", t.status === "paid" && t.bids === 4 && t.eligible === 3 && t.over_budget === 1 && t.assessed === 3 && t.compliant === 2 && t.appeals === 1 && t.challenges === 1 && t.winner?.bid === bids.middle, JSON.stringify(t).slice(0, 200));
  const page = await seen("bids_end", "bids_of", [T1, 0, 20]);
  ok("bids_of(T1): every bid with its price, proposal, salt, mask and fingerprint", page.total === 4 && page.rows?.every((r) => r.commitment === commitment(BigInt(r.price), r.proposal, r.salt)), JSON.stringify(page.rows?.map((r) => r.status + " " + r.mask)));
  const rules = await seen("rules", "rules", []);
  ok("rules(): the question word for word, both orders, the combine table and the limits", String(rules.question).startsWith("Does the PROPOSAL commit to requirement {k}?") && rules.askings?.length === 2 && String(rules.compared).includes("exact string equality") && String(rules.limits?.[0]).includes("does not judge the work") && String(rules.challenge).includes("knocks the bid out"), Object.keys(rules).join(","));
  const stats = await seen("stats", "stats", []);
  ok("stats(): one tender, four bids, one awarded and paid, three assessed, one appeal, one challenge, nothing held", stats.tenders === 1 && stats.bids === 4 && stats.paid === 1 && stats.assessed === 3 && stats.appeals === 1 && stats.challenges === 1 && stats.knocked_out === 0 && stats.balance_owed === "0", JSON.stringify(stats));
  ok("the contract's own balance is zero", (await balance(st.contract)) === 0n, String(await balance(st.contract)));

  const bytes = readFileSync(FILE);
  const chain = Buffer.from(String(await rpc("gen_getContractCode", [st.contract])), "base64");
  st.code = { address: st.contract, bytes: chain.length, sha256: sha(chain), file_bytes: bytes.length, file_sha256: sha(bytes), identical: Buffer.compare(chain, bytes) === 0 };
  save();
  ok(`the code deployed at ${st.contract} is byte for byte contracts/tender.py`, st.code.identical, `${chain.length} bytes, sha256 ${st.code.sha256}`);

  st.end = {}; for (const k of Object.keys(ROLES)) st.end[k] = String(await balance(acct[k].address));
  st.ended = new Date().toISOString(); save();
  // what each account should have gained or lost, read off the receipts
  const want = Object.fromEntries(Object.keys(ROLES).map((k) => [k, 0n]));
  const winner = need(bidderOf[jsonOf(st.steps.award?.tries.at(-1)?.msg || "")?.winner], "the winner of T1");
  for (const id of st.order) {
    const s = st.steps[id], j = jsonOf(s.tries.at(-1)?.msg || "");
    if (!j?.ok) continue;
    if (s.fn === "deposit") want[s.who] -= BigInt(j.deposited);
    if (s.fn === "withdraw") want[s.who] += BigInt(j.returned);
    if (s.fn === "open_tender") want[s.who] -= BigInt(j.budget);
    if (s.fn === "bid" && !j.from_credit) want[s.who] -= BigInt(j.bond);
    if (s.fn === "award") want.buyer += BigInt(j.returned);
    if (s.fn === "complete") want[winner] += BigInt(j.paid);
    if (s.fn === "appeal" && j.appeal === "upheld") want.buyer += BigInt(j.bond);
  }
  const net = (k) => BigInt(st.end[k]) - BigInt(st.start[k]);
  const feeTotal = (k) => BigInt(st.fees[k] || "0");
  ok("over the run every account ends exactly where the receipts say, less exactly the fees its own transactions paid: MIDDLE 0.85 GEN up (the price and DEAR's challenge bond), CHEAP and DEAR 0.05 GEN down (their upheld appeal and challenge), BUYER 0.75 GEN down", Object.keys(want).every((k) => net(k) === want[k] - feeTotal(k)) && want.middle === P_MIDDLE_PRICE + BOND && want.cheap === -BOND && want.dear === -BOND && want.buyer === BOND - P_MIDDLE_PRICE && want.stranger === 0n, Object.keys(want).map((k) => k.toUpperCase() + " " + Number(net(k)) / 1e18 + " (receipts " + Number(want[k]) / 1e18 + ", fees " + Number(feeTotal(k)) / 1e18 + ")").join("  "));
  const all = st.order.flatMap((id) => st.steps[id].tries);
  const badTx = all.filter((t) => t.status !== "FINALIZED" || !["FINISHED_WITH_RETURN", "FINISHED_WITH_ERROR"].includes(t.exec));
  ok(`every one of the ${all.length} transactions is FINALIZED with an execution result of FINISHED_WITH_RETURN or FINISHED_WITH_ERROR, and every one paid a fee`, badTx.length === 0 && all.every((t) => t.fee !== null && BigInt(t.fee) > 0n), badTx.map((t) => t.tx + " " + t.status + " " + t.exec).join(", "));
  st.fee_summary = Object.fromEntries(Object.keys(ROLES).map((k) => [k, String(feeTotal(k))]));
  save();
}

st.checks = { pass, fail }; save();
console.log(`\n${pass} passed, ${fail} failed`);
console.log("Tender:", st.contract);
console.log("transactions:", st.order.reduce((n, id) => n + st.steps[id].tries.length, 0), "in", st.order.length, "steps; sent a second time:", st.order.filter((id) => st.steps[id].tries.length > 1).join(", ") || "none");
for (const id of st.order) { const s = st.steps[id], j = jsonOf(s.tries.at(-1)?.msg || ""); if (j?.mask || j?.appeal || j?.challenge) console.log(`${id.padEnd(18)} ${s.tries.map((t) => t.tx + " " + tally(t.votes)).join(" | ")}  ${j.bid} ${j.appeal || j.challenge || ""} ${j.mask}`); }
console.log("fees paid, atto:", JSON.stringify(st.fee_summary));
console.log("record:", RECORD);
process.exit(fail ? 1 : 0);
