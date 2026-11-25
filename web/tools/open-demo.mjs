// Opens the demo tender on a deployed Tender register, by hand: reads the demo key from a JSON file, derives
// the demo school and the two rival decorators from it (lib/demo-key.ts), funds them from Studio's faucet,
// opens "Repaint Elm Street Primary classrooms" with the demo windows (lib/demo-script.ts) and has both
// rivals send their sealed bids. Nothing in the build runs it.
//
//   node tools/open-demo.mjs 0xREGISTER path/to/demo-key.json
//   DRY=1 node tools/open-demo.mjs 0xREGISTER path/to/demo-key.json    # check and print the calls, send nothing
//
// The key file holds the same throwaway Studio key the site's server holds in DEMO_KEY, as
// {"privateKey": "0x..."} (or "key", "private_key", "DEMO_KEY", or the bare key as a JSON string). It is never
// printed; only the three public addresses are. If a demo tender from this key is still taking bids with more
// than five minutes left, no new one is opened and only a missing rival bid is sent. Each transaction is
// followed to a final status and a finished execution result. Studio v0.123 charges fees: every transaction
// carries the fee quoted by estimateTransactionFees() (lib/fees.ts), and what it cost is printed from its own fee
// accounting. Needs Node 22.18 or later (it reads lib/*.ts directly).

import { readFileSync } from "node:fs";
import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { getAddress } from "viem";

import { cleanKey, deriveAll, keyProblem } from "../lib/demo-key.ts";
import { feePaid, quoteFees } from "../lib/fees.ts";
import { DEMO_BOND, DEMO_BUDGET, DEMO_OPEN_ARGS, DEMO_REQUIREMENTS, DEMO_SCOPE, DEMO_TITLE, RIVALS, rivalCommitment } from "../lib/demo-script.ts";
import { proposalProblem, requirementsOf, scopeProblem, titleProblem } from "../lib/rules.ts";

const RPC = "https://studio.genlayer.com/api";
const EXPLORER = "https://explorer-studio.genlayer.com";
const studio = { ...studionet, rpcUrls: { ...studionet.rpcUrls, default: { http: [RPC] } } };
const DRY = process.env.DRY === "1";
const fail = (m) => {
  console.error(m);
  process.exit(2);
};

const [REGISTER = "", KEY_FILE = ""] = process.argv.slice(2).map((s) => s.trim());
if (!/^0x[0-9a-fA-F]{40}$/.test(REGISTER) || !KEY_FILE) fail("usage: node tools/open-demo.mjs 0xREGISTER path/to/key.json");

function keyFrom(file) {
  let data;
  try {
    data = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    fail("the key file could not be read as JSON");
  }
  if (typeof data === "string") return data;
  const o = data && typeof data === "object" ? data : {};
  return o.privateKey ?? o.private_key ?? o.key ?? o.DEMO_KEY ?? "";
}
const raw = keyFrom(KEY_FILE);
const problem = keyProblem(raw);
if (problem) fail(`the key file: ${problem}`);
const acc = deriveAll(raw);
if (!acc) fail("the key does not derive three usable accounts; use another key");
const key = cleanKey(raw);

// Every text the clerk will ever sign must pass the contract's doors.
const why = titleProblem(DEMO_TITLE) || scopeProblem(DEMO_SCOPE) || requirementsOf(DEMO_REQUIREMENTS.join("|"))[1] || RIVALS.map((r) => proposalProblem(r.proposal)).find(Boolean);
if (why) fail(`the demo tender would be refused: ${why}`);

for (const [label, a] of Object.entries(acc)) console.log(`demo ${label.padEnd(8)} ${getAddress(a.address)}`);
console.log(`${DRY ? "DRY RUN: " : ""}to ${REGISTER}`);
console.log(`  open_tender(${DEMO_OPEN_ARGS(Math.floor(Date.now() / 1000)).map((x) => JSON.stringify(x)).join(", ")}) with ${DEMO_BUDGET} atto   as the school`);
for (const r of RIVALS) console.log(`  bid(<tender>, <sealed ${r.priceAtto} atto>) with ${DEMO_BOND} atto   as ${r.name}`);
if (DRY) process.exit(0);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function rpc(method, params) {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
      const body = await res.json();
      if (body.error) {
        await sleep(res.status === 429 || body.error.code === -32029 ? 20_000 : 5000);
        continue;
      }
      return body.result;
    } catch {
      await sleep(4000);
    }
  }
  throw new Error(`${method} did not answer`);
}

async function follow(hash) {
  for (let i = 0; i < 300; i++) {
    await sleep(4000);
    const tx = await rpc("eth_getTransactionByHash", [hash]);
    const status = String(tx?.status ?? "");
    if (["FINALIZED", "CANCELED", "UNDETERMINED"].includes(status)) {
      const lr = tx.consensus_data?.leader_receipt;
      const one = Array.isArray(lr) ? lr[0] : lr;
      let text = "";
      try {
        text = Buffer.from(one?.result ?? "", "base64").toString("utf8");
      } catch {
        text = "";
      }
      const start = text.indexOf("{");
      let json = null;
      try {
        json = start >= 0 ? JSON.parse(text.slice(start, text.lastIndexOf("}") + 1)) : null;
      } catch {
        json = null;
      }
      const votes = Object.values(tx.consensus_data?.votes ?? {});
      let fee = feePaid(tx);
      for (let k = 0; k < 10 && fee === null && status === "FINALIZED"; k++) {
        await sleep(3000);
        fee = feePaid(await rpc("eth_getTransactionByHash", [hash]));
      }
      return { status, exec: String(tx.txExecutionResultName ?? ""), json, agree: votes.filter((v) => v === "agree").length, of: votes.length, text, fee };
    }
  }
  return { status: "TIMEOUT", exec: "", json: null, agree: 0, of: 0, text: "", fee: null };
}

const reader = createClient({ chain: studio });
async function read(functionName, args) {
  for (let i = 0; i < 8; i++) {
    try {
      const r = await reader.readContract({ address: REGISTER, functionName, args });
      return typeof r === "string" ? JSON.parse(r) : r;
    } catch {
      await sleep(5000);
    }
  }
  throw new Error(`could not read ${functionName}() from Studio`);
}

async function send(k, functionName, args, value, label) {
  const client = createClient({ chain: studio, account: createAccount(k) });
  for (let tries = 1; ; tries++) {
    try {
      const fees = await quoteFees(client);
      const hash = await client.writeContract({ address: REGISTER, functionName, args, value, fees });
      const done = await follow(hash);
      const okay = done.status === "FINALIZED" && done.exec === "FINISHED_WITH_RETURN" && done.json?.ok === true;
      console.log(`${okay ? "OK  " : "FAIL"}  ${label}: ${done.status} ${done.exec}${okay ? "" : " " + done.text.slice(0, 160)}  ${done.agree}/${done.of} agree  fee ${done.fee ?? "?"} atto  ${EXPLORER}/tx/${hash}`);
      if (!okay) process.exit(1);
      return done.json;
    } catch (e) {
      if (tries >= 3) fail(`${label} not sent (${String(e?.shortMessage || e?.message || e).slice(0, 80)})`);
      await sleep(15_000);
    }
  }
}

// GEN to sign with: the school needs the 1.2 GEN budget, each rival its bonds.
for (const a of Object.values(acc)) {
  const have = BigInt((await rpc("eth_getBalance", [a.address, "latest"])) || "0x0");
  if (have >= 3n * 10n ** 18n) continue;
  await rpc("sim_fundAccount", { account_address: getAddress(a.address), amount: 20e18 });
  for (let i = 0; i < 20 && BigInt((await rpc("eth_getBalance", [a.address, "latest"])) || "0x0") <= have; i++) await sleep(3000);
}

const mine = await read("tenders_of", [acc.buyer.address, 0, 20]);
const last = mine.total > 20 ? await read("tenders_of", [acc.buyer.address, Math.floor((mine.total - 1) / 20) * 20, 20]) : mine;
const newest = (last.rows ?? []).filter((r) => r.role === "buyer").sort((a, b) => Number(b.tender.slice(1)) - Number(a.tender.slice(1)))[0];
let tender = "";
if (newest) {
  const t = await read("tender", [newest.tender]);
  if (t.phase === "bidding" && t.bid_by - (t.now || Math.floor(Date.now() / 1000)) > 300) tender = t.tender;
}
if (!tender) tender = (await send(acc.buyer.key, "open_tender", DEMO_OPEN_ARGS(Math.floor(Date.now() / 1000)), DEMO_BUDGET, "the school opens the demo tender")).tender;
else console.log(`SKIP  ${tender} is still taking bids; it is the demo tender`);

const bids = await read("bids_of", [tender, 0, 20]);
for (const r of RIVALS) {
  if ((bids.rows ?? []).some((b) => b.bidder === acc[r.key].address)) {
    console.log(`SKIP  ${r.name} has already bid on ${tender}`);
    continue;
  }
  await send(acc[r.key].key, "bid", [tender, rivalCommitment(key, tender, r.key)], DEMO_BOND, `${r.name} bids on ${tender}`);
}
console.log(`\nThe demo tender is ${tender}. Set DEMO_KEY on the host to the same key and check GET /api/demo/status.`);
