// The demo clerk, server side only (imported by app/api/demo/*). It holds one throwaway Studio secret,
// DEMO_KEY, and derives three accounts from it (lib/demo-key.ts): the demo buyer, Elm Street Primary School,
// and the two rival decorators. It signs only what lib/demo-script.ts lists as a move the clerk may make
// now: open_tender() of the one demonstration notice, word for word; bid() and reveal() by the two rivals
// with their fixed proposals and prices (each salt made from the key, so nothing is kept between calls);
// and assess(), place(), award(), complete() and reclaim() on demo tenders. It never appeals, challenges,
// disputes, waives or withdraws, and nothing a visitor types is ever signed: a visitor names a move, a
// tender, a bid or a rival at most. The key is never logged, never returned and never written anywhere.

import { createAccount, createClient } from "genlayer-js";
import { getAddress, type Address } from "viem";

import { balanceOf, contractAddress, isMock, readBids, readTender, readTendersOfWindow, returnedId, studio } from "./chain";
import { cleanKey, deriveAll, keyProblem } from "./demo-key";
import { DEMO_LIMITS, createLimiter } from "./demo-limit";
import { DEMO_BUDGET, DEMO_OPEN_ARGS, RIVALS, demoTurn, rivalCommitment, rivalSalt, type DemoAddrs, type RivalKey } from "./demo-script";
import { FINAL_STATUSES, decodeTx, rpc, sleep, statusName, type RawTx } from "./rpc";
import type { DemoMove, DemoStatus, Tender } from "./types";

export const MOCK_REASON = "in the demo build the demo clerk answers in the browser";
export const NO_CONTRACT_REASON = "the contract is not deployed yet";
export const RPC_DOWN = "Studio's RPC did not answer; try again in a minute";
export const noBalance = (who: string) => `the demo ${who} account holds too little GEN and Studio's faucet did not top it up`;

type Accounts = NonNullable<ReturnType<typeof deriveAll>>;
let derived: { raw: string; value: Accounts | null } | null = null;
function accounts(): Accounts | null {
  const raw = process.env.DEMO_KEY ?? "";
  if (!derived || derived.raw !== raw) derived = { raw, value: deriveAll(raw) };
  return derived.value;
}
const addrsOf = (a: Accounts): DemoAddrs => ({ buyer: a.buyer.address, "rival-a": a["rival-a"].address, "rival-b": a["rival-b"].address });

/** Each derived account signs from its own balance; Studio's faucet refills one that holds less than it needs. */
async function ensureBalance(address: string, need: bigint): Promise<boolean> {
  const have = await balanceOf(address);
  if (have >= need) return true;
  try {
    await rpc("sim_fundAccount", { account_address: getAddress(address), amount: 20e18 });
  } catch {
    return false;
  }
  for (let i = 0; i < 6; i++) {
    await sleep(2000);
    try {
      if ((await balanceOf(address)) >= need) return true;
    } catch {
      /* one dropped read; ask again */
    }
  }
  return false;
}

/** The newest tender the demo buyer opened, or null. */
async function newestDemo(buyer: string): Promise<Tender | null> {
  const rows = (await readTendersOfWindow(buyer, 2, { fresh: true })).data.rows.filter((r) => r.role === "buyer");
  if (!rows[0]) return null;
  return (await readTender(rows[0].id, { fresh: true })).data;
}

const off = (reason: string, extra: Partial<DemoStatus> = {}): DemoStatus => ({ online: false, reason, buyer: "", rivalA: "", rivalB: "", tender: "", phase: "", ...extra });

let cached: { at: number; value: DemoStatus } | null = null;

/** Whether the demo clerk can act now, and exactly why not. */
export async function demoStatusNow(opts: { fresh?: boolean } = {}): Promise<DemoStatus> {
  if (isMock) return off(MOCK_REASON);
  const problem = keyProblem(process.env.DEMO_KEY);
  if (problem) return off(problem);
  const a = accounts();
  if (!a) return off("the key set does not derive three usable accounts; set another DEMO_KEY");
  const base = { buyer: a.buyer.address, rivalA: a["rival-a"].address, rivalB: a["rival-b"].address };
  if (!contractAddress()) return off(NO_CONTRACT_REASON, base);
  if (!opts.fresh && cached && Date.now() - cached.at < 15_000) return cached.value;
  const GEN = 10n ** 18n;
  try {
    if (!(await ensureBalance(a.buyer.address, 3n * GEN))) return off(noBalance("buyer"), base);
    for (const r of RIVALS) if (!(await ensureBalance(a[r.key].address, GEN))) return off(noBalance(r.key), base);
    const t = await newestDemo(a.buyer.address);
    const value: DemoStatus = { online: true, reason: "", ...base, tender: t?.id ?? "", phase: t?.phase ?? "" };
    cached = { at: Date.now(), value };
    return value;
  } catch {
    return off(RPC_DOWN, base);
  }
}

const limiter = createLimiter(DEMO_LIMITS);
/** Fresh demo tenders per client address per day: each one locks 1.2 GEN of the demo buyer's for a while. */
const OPENS_PER_DAY = 6;
const opensBy = new Map<string, number[]>();

const inflight = new Map<string, { hash: string; at: number }>();
async function stillMoving(address: string): Promise<boolean> {
  const last = inflight.get(address);
  if (!last) return false;
  if (Date.now() - last.at > DEMO_LIMITS.sentHoldMs) {
    inflight.delete(address);
    return false;
  }
  try {
    const tx = await rpc<RawTx | null>("eth_getTransactionByHash", [last.hash]);
    if (tx && FINAL_STATUSES.has(statusName(tx.status))) {
      inflight.delete(address);
      return false;
    }
  } catch {
    /* not readable now: still moving, as far as anyone can tell */
  }
  return true;
}

// One signature at a time: the demo accounts never race each other.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.catch(() => undefined);
  return run;
}

async function sign(key: `0x${string}`, address: string, functionName: string, args: (string | number)[], value: bigint): Promise<string> {
  const hash = await serial(async () => {
    const client = createClient({ chain: studio, account: createAccount(key) });
    return client.writeContract({ address: contractAddress() as Address, functionName, args, value });
  });
  if (typeof hash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error("no hash");
  inflight.set(address, { hash, at: Date.now() });
  return hash;
}

async function follow(hash: string, ms: number) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    await sleep(3000);
    try {
      const tx = await rpc<RawTx | null>("eth_getTransactionByHash", [hash]);
      if (tx && FINAL_STATUSES.has(statusName(tx.status))) return decodeTx(tx);
    } catch {
      /* a dropped poll; ask again */
    }
  }
  return null;
}

export type ServerAnswer = { status: number; body: { ok: true; hash: string; note: string } | { ok: false; reason: string; retryAfter?: number } };
const no = (status: number, reason: string, retryAfter?: number): ServerAnswer => ({ status, body: retryAfter ? { ok: false, reason, retryAfter } : { ok: false, reason } });
const yes = (hash: string, note = ""): ServerAnswer => ({ status: 200, body: { ok: true, hash, note } });

async function rivalBids(a: Accounts, tender: string, bondAtto: bigint, only?: RivalKey): Promise<string[]> {
  const out: string[] = [];
  for (const r of RIVALS) {
    if (only && r.key !== only) continue;
    out.push(await sign(a[r.key].key, a[r.key].address, "bid", [tender, rivalCommitment(cleanKey(process.env.DEMO_KEY), tender, r.key)], bondAtto));
  }
  return out;
}

/** POST /api/demo/move: one move of the demo clerk, if lib/demo-script.ts allows it now. */
export async function sendMove(want: { move: DemoMove; tender: string; bid: string; rival: string }, client: string): Promise<ServerAnswer> {
  const s = await demoStatusNow();
  if (!s.online) return no(503, "the demo clerk is offline: " + s.reason);
  const a = accounts()!;
  const addrs = addrsOf(a);
  const lim = limiter.attempt(`${want.move}:${want.tender}:${want.bid}:${want.rival}`, Date.now());
  if (!lim.ok) return no(429, `the demo clerk was asked that a moment ago; try again in ${lim.retryAfter} s`, lim.retryAfter);
  try {
    const t = want.move === "open" ? (s.tender ? (await readTender(s.tender, { fresh: true })).data : null) : (await readTender(want.tender, { fresh: true })).data;
    if (want.move !== "open" && (!t || t.buyer !== addrs.buyer)) return no(409, "the demo clerk acts only on tenders the demo school opened");
    const bids = t ? (await readBids(t.id, { fresh: true })).data.rows : [];
    const now = Math.floor(Date.now() / 1000);
    const m = demoTurn(t, bids, addrs, now, want);
    if (typeof m === "string") return no(409, m);
    if (m.move === "open") {
      const day = Date.now() - 86_400_000;
      const mine = (opensBy.get(client) ?? []).filter((x) => x > day);
      if (mine.length >= OPENS_PER_DAY) return no(429, `this connection has opened ${OPENS_PER_DAY} demo tenders today, the most it may; try again tomorrow`);
      if (await stillMoving(addrs.buyer)) return no(409, "the demo school is still waiting for its last transaction to be final; try again in a minute", 30);
      opensBy.set(client, [...mine, Date.now()]);
      const hash = await sign(a.buyer.key, addrs.buyer, "open_tender", DEMO_OPEN_ARGS(now), DEMO_BUDGET);
      cached = null;
      // The rivals need the new tender's id, which only the final transaction carries. Wait for it a while;
      // when it takes longer, the page offers "the rivals bid" once it sees the tender.
      const id = returnedId(await follow(hash, 40_000), "tender");
      if (!id) return yes(hash, "the notice is going up; the rivals bid once it is final");
      const fresh = (await readTender(id, { fresh: true })).data;
      if (!fresh) return yes(hash, "the notice is up; the rivals bid on the next try");
      await rivalBids(a, id, BigInt(fresh.bidBondAtto));
      return yes(hash, `${id} is up and both rivals have sent their sealed bids`);
    }
    if (m.move === "bid") {
      if (await stillMoving(addrs[m.rival!])) return no(409, "that rival's last transaction is not final yet; try again in a minute", 30);
      const [hash] = await rivalBids(a, t!.id, BigInt(t!.bidBondAtto), m.rival);
      return yes(hash);
    }
    if (m.move === "reveal") {
      const r = RIVALS.find((x) => x.key === m.rival)!;
      return yes(await sign(a[r.key].key, addrs[r.key], "reveal", [m.bid!, r.priceAtto.toString(), r.proposal, rivalSalt(cleanKey(process.env.DEMO_KEY), t!.id, r.key)], 0n));
    }
    if (m.move === "place") return yes(await sign(a.buyer.key, addrs.buyer, "place", [m.bid!, m.after ?? ""], 0n));
    if (m.move === "assess" || m.move === "reclaim") return yes(await sign(a.buyer.key, addrs.buyer, m.move, [m.bid!], 0n));
    return yes(await sign(a.buyer.key, addrs.buyer, m.move, [t!.id], 0n));
  } catch {
    // Nothing of the error goes out: it is the network's, and it is not the visitor's business.
    return no(502, "Studio did not take the demo clerk's transaction; try again in a minute");
  }
}
