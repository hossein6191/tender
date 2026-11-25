// Chain access for Tender: the one file that knows how the site talks to the register. Method names and
// argument orders are in lib/calls.ts, the JSON shapes in lib/parse.ts; lib/chain-mock.ts stands in for the
// contract in mock mode and answers in the contract's own JSON.
//
// Reads go through readContract (gen_call) with the retry policy in lib/rpc.ts: Studio answers "Contract
// not found" for a healthy contract for about a minute after a deploy. A failed read is never "no data"
// and never proof that a write failed. Studio allows 30 gen_call a minute from one browser, so every view
// answer is cached for 30 s and invalidateReads() drops the cache once a transaction is final.

import * as mock from "./chain-mock";
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { getAddress, type Address } from "viem";
import { notify } from "./browser-store";
import { contractAddress } from "./config";
import { quoteFees } from "./fees";
import { RULES_COPY } from "./contract-rules";
import { idNumber, sentence } from "./format";
import { asRow, mapBid, mapBidPage, mapCredit, mapMyPage, mapStats, mapTender, mapTenderPage, num, parseView, str } from "./parse";
import { RATE_LIMITED, createReadCache, decodeTx, isMissingMethodError, noteFailure, rpc, sleep, waitForCooldown, withRetry, type RawTx } from "./rpc";
import type { Arg, Bid, Call, DemoAnswer, DemoMove, DemoStatus, MyRow, Paged, Phase, ReadResult, Rules, Stats, Tender, TenderRow, TxStatus } from "./types";
import { chainName, getChainId, getSigner } from "./wallet";

export { RATE_LIMITED, cooldownRemainingMs } from "./rpc";
export { contractAddress };

export const CHAIN_ID = 61999;
export const RPC_URL = "https://studio.genlayer.com/api";
export const EXPLORER_URL = "https://explorer-studio.genlayer.com";

export const isMock = process.env.NEXT_PUBLIC_MOCK === "1";

export const NETWORK_ERROR = "could not reach the network";
export const NO_CONTRACT = "the contract is not deployed yet";
export const FAUCET_REFUSED = "Studio refused the faucet request (it allows 30 requests a minute from one browser). Try again in a minute.";

export const hasContract = (): boolean => isMock || !!contractAddress();
export const contractInUse = (): string => (isMock ? mock.MOCK_CONTRACT : contractAddress());

export const studio = {
  ...studionet,
  rpcUrls: { ...studionet.rpcUrls, default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: "GenLayer Studio Explorer", url: EXPLORER_URL } },
};

const reader = () => createClient({ chain: studio });

export const READ_TTL_MS = 30_000;
const onServer = typeof window === "undefined";
const views = createReadCache<unknown>(onServer ? 0 : READ_TTL_MS);

let moved = 0;
export const chainVersion = (): number => moved;

export const invalidateReads = () => {
  views.clear();
  moved++;
  notify();
};

async function view(fn: string, args: Arg[] = [], opts: { fresh?: boolean } = {}): Promise<unknown> {
  if (isMock) return parseView(await mock.view(fn, args));
  const address = contractAddress();
  if (!address) throw new Error(NO_CONTRACT);
  const key = `${address.toLowerCase()}|${fn}|${JSON.stringify(args)}`;
  if (opts.fresh) views.forget(key);
  try {
    const raw = await views.get(key, () =>
      withRetry(() => reader().readContract({ address: address as Address, functionName: fn, args: args as never }), { bucket: "gen", giveUp: isMissingMethodError }),
    );
    return parseView(raw);
  } catch (e) {
    if (e instanceof Error && e.message === RATE_LIMITED) throw e;
    throw new Error(NETWORK_ERROR);
  }
}

const SOURCE: ReadResult<unknown>["source"] = isMock ? "mock" : "chain";
const result = <T>(data: T): ReadResult<T> => ({ data, source: SOURCE });
type Fresh = { fresh?: boolean };

export const PAGE = 20;
const pageArgs = (offset: number, limit: number): [number, number] => [Math.max(0, Math.trunc(offset)), Math.max(1, Math.min(PAGE, Math.trunc(limit)))];

export async function readTender(id: string, opts: Fresh = {}): Promise<ReadResult<Tender | null>> {
  return result(mapTender(await view("tender", [id], opts)));
}

/** Every bid of a tender, in commitment order: up to `maxPages` pages of twenty. */
export async function readBids(id: string, opts: Fresh & { maxPages?: number } = {}): Promise<ReadResult<{ total: number; rows: Bid[]; partial: boolean }>> {
  const first = mapBidPage(await view("bids_of", [id, 0, PAGE], opts));
  const rows = [...first.rows];
  const pages = Math.ceil(first.total / PAGE);
  const max = opts.maxPages ?? 5;
  for (let p = 1; p < pages && p < max; p++) rows.push(...mapBidPage(await view("bids_of", [id, p * PAGE, PAGE], opts)).rows);
  return result({ total: first.total, rows, partial: pages > max });
}

export async function readBid(id: string, opts: Fresh = {}): Promise<ReadResult<Bid | null>> {
  return result(mapBid(await view("bid_of", [id], opts)));
}

export async function readCredit(address: string, opts: Fresh = {}): Promise<ReadResult<string>> {
  return result(mapCredit(await view("credit", [address.toLowerCase()], opts)));
}

async function newestFirst<T extends { id: string }>(read: (offset: number) => Promise<Paged<T>>, maxPages: number): Promise<{ total: number; rows: T[]; partial: boolean }> {
  const first = await read(0);
  const pages = Math.ceil(first.total / PAGE);
  const rows = [...first.rows];
  for (let p = pages - 1, k = 1; p >= 1 && k < maxPages; p--, k++) rows.push(...(await read(p * PAGE)).rows);
  const unique = new Map(rows.map((r) => [r.id, r]));
  return { total: first.total, rows: [...unique.values()].sort((a, b) => idNumber(b.id) - idNumber(a.id)), partial: pages > maxPages };
}

export async function readTendersWindow(maxPages = 3, opts: Fresh = {}): Promise<ReadResult<{ total: number; rows: TenderRow[]; partial: boolean }>> {
  return result(await newestFirst(async (o) => mapTenderPage(await view("tenders", pageArgs(o, PAGE), opts)), maxPages));
}

export async function readTendersOfWindow(address: string, maxPages = 3, opts: Fresh = {}): Promise<ReadResult<{ total: number; rows: MyRow[]; partial: boolean }>> {
  return result(await newestFirst(async (o) => mapMyPage(await view("tenders_of", [address.toLowerCase(), ...pageArgs(o, PAGE)], opts)), maxPages));
}

export async function readStats(opts: Fresh = {}): Promise<ReadResult<Stats>> {
  return result(mapStats(await view("stats", [], opts)));
}

/** rules() from the register; in mock mode, or with no register, the copy in lib/contract-rules.ts. */
export async function readRules(): Promise<ReadResult<Rules> & { copy: boolean }> {
  if (isMock || !contractAddress()) return { ...result(RULES_COPY), copy: true };
  return { ...result(asRow(await view("rules", []))), copy: false };
}

// ---- writes ----------------------------------------------------------------------------------------

const WRONG_CHAIN = (chainId: number | null) => `Your wallet is on ${chainName(chainId)}. Switch it to GenLayer Studio (chain 61999) before signing.`;

export async function write(call: Call): Promise<string> {
  if (isMock) return mock.write(call);
  const address = contractAddress();
  if (!address) throw new Error("The contract is not deployed yet, so there is nothing to sign.");
  const signer = getSigner();
  if (!signer) throw new Error("Connect a wallet first.");
  const chainId = await getChainId(signer.provider);
  if (chainId !== CHAIN_ID) throw new Error(WRONG_CHAIN(chainId));
  const client = createClient({ chain: studio, account: signer.address as Address, provider: signer.provider });
  // Studio v0.123 charges a fee on every write: quoted first, then carried with the call
  let fees;
  try {
    fees = await quoteFees(client);
  } catch {
    throw new Error("Studio did not quote the network fee for this call, so nothing was sent. Try again in a minute.");
  }
  const hash = await client.writeContract({ address: address as Address, functionName: call.fn, args: call.args as never, value: call.value ?? 0n, fees } as never);
  if (typeof hash !== "string" || !hash.startsWith("0x")) throw new Error("The wallet returned no transaction hash.");
  return hash;
}

// ---- outcomes ------------------------------------------------------------------------------------

export const stored = (s: TxStatus | null): s is TxStatus => !!s && !s.undetermined && s.applied !== false && s.status !== "CANCELED";

function raisedSentence(s: TxStatus): string {
  const m = /\[(?:EXPECTED|TRANSIENT|LLM_ERROR)\]\s*([^"}\n]+)/.exec(s.message || "");
  return m ? sentence(m[1]) : "";
}

export function refusalReason(s: TxStatus | null): string {
  if (!s) return "";
  const r = s.result;
  if (r && r.ok === false) return sentence(str(r.reason));
  if (s.exec === "ERROR" && !s.undetermined) return raisedSentence(s) || sentence(s.message || "");
  return "";
}

export function failureOf(s: TxStatus | null): string {
  if (!s) return "";
  if (s.undetermined) return "The validators did not reach a majority, so nothing was stored and no money moved. Sending the same call again is safe.";
  if (s.status === "CANCELED") return "The network cancelled the transaction. Nothing was stored.";
  const reason = refusalReason(s);
  if (reason) return reason;
  if (s.applied === false) return "The validators did not accept this transaction. Nothing was stored.";
  return "";
}

export const succeeded = (s: TxStatus | null): boolean => !!s && s.status === "FINALIZED" && stored(s) && s.exec !== "ERROR" && s.result?.ok !== false;

/** The id a final open_tender() or bid() returned, or "". */
export const returnedId = (s: TxStatus | null, key: "tender" | "bid"): string => (stored(s) && s.result?.ok === true && /^[TB][1-9]\d{0,8}$/.test(str(s.result[key])) ? str(s.result[key]) : "");

export function movesMoney(s: TxStatus): boolean {
  const r = s.result;
  if (!r) return false;
  if (r.ok === false) return str(r.returned, "0") !== "0";
  return ["returned", "paid"].some((k) => !["", "0"].includes(str(r[k], "0"))) || str(r.to) === "buyer" || str(r.bond_to) === "buyer";
}

// ---- the demo clerk -------------------------------------------------------------------------------

let demoCache: { at: number; value: DemoStatus } | null = null;
const PHASES: Phase[] = ["bidding", "revealing", "reviewing", "ready_to_award", "awarded", "paid", "waived", "no_award"];

export async function readDemoStatus(opts: Fresh = {}): Promise<DemoStatus> {
  if (isMock) return mock.demoStatus();
  if (!opts.fresh && demoCache && Date.now() - demoCache.at < 20_000) return demoCache.value;
  const a = (v: unknown) => (/^0x[0-9a-f]{40}$/.test(str(v).toLowerCase()) ? str(v).toLowerCase() : "");
  try {
    const res = await fetch("/api/demo/status", { cache: "no-store" });
    const b = (await res.json()) as Record<string, unknown>;
    const value: DemoStatus = {
      online: b.online === true,
      reason: str(b.reason),
      buyer: a(b.buyer),
      rivalA: a(b.rivalA),
      rivalB: a(b.rivalB),
      tender: /^T[1-9]\d{0,8}$/.test(str(b.tender)) ? str(b.tender) : "",
      phase: PHASES.includes(str(b.phase) as Phase) ? (str(b.phase) as Phase) : "",
    };
    demoCache = { at: Date.now(), value };
    return value;
  } catch {
    return { online: false, reason: "the site's server did not answer", buyer: "", rivalA: "", rivalB: "", tender: "", phase: "" };
  }
}

/** Asks the demo clerk to make one move on a demo tender. */
export async function askDemo(move: DemoMove, target: { tender?: string; bid?: string; rival?: string }): Promise<DemoAnswer> {
  demoCache = null;
  if (isMock) {
    const ans = await mock.demoMove(move, target);
    return ans.ok ? ans : { ok: false, reason: sentence(ans.reason) };
  }
  try {
    const res = await fetch("/api/demo/move", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ move, ...target }) });
    const ans = (await res.json()) as Record<string, unknown>;
    if (ans.ok === true && typeof ans.hash === "string" && /^0x[0-9a-fA-F]{64}$/.test(ans.hash)) return { ok: true, hash: ans.hash, note: str(ans.note) };
    return { ok: false, reason: sentence(str(ans.reason, "the demo clerk did not answer")), retryAfter: num(ans.retryAfter) || undefined };
  } catch {
    return { ok: false, reason: "The site's server did not answer. Try again in a minute." };
  }
}

// ---- transactions, balances, the faucet -------------------------------------------------------------

export async function txStatus(hash: string): Promise<TxStatus> {
  if (isMock) return mock.txStatus(hash);
  const tx = await withRetry(() => rpc<RawTx | null>("eth_getTransactionByHash", [hash]), { tries: 2, bucket: "eth", ownBudget: true });
  return decodeTx(tx);
}

export async function balanceOf(address: string): Promise<bigint> {
  if (isMock) return mock.balanceOf(address);
  const hex = await withRetry(() => rpc<string>("eth_getBalance", [address, "latest"]), { tries: 3, bucket: "eth", ownBudget: true });
  return BigInt(hex || "0x0");
}

export async function faucet(address: string, opts: { stillWanted?: () => boolean } = {}): Promise<bigint> {
  if (isMock) return mock.faucet(address);
  let account: string;
  try {
    account = getAddress(address);
  } catch {
    throw new Error("That is not a valid 0x address, so the faucet was not asked.");
  }
  const before = await balanceOf(account).catch(() => {
    throw new Error("Could not read this wallet's balance from Studio, so the faucet was not asked. Try again in a few seconds.");
  });
  let sent = false;
  for (let i = 0; i < 3 && !sent; i++) {
    await waitForCooldown("gen");
    try {
      // `amount` is wei as a JS number; Studio credits only a checksummed address.
      await rpc("sim_fundAccount", { account_address: account, amount: 10e18 });
      sent = true;
    } catch (e) {
      noteFailure(e, Date.now(), "gen");
      if (i === 2) throw new Error(FAUCET_REFUSED);
      await sleep(10_000);
    }
  }
  const started = Date.now();
  while (Date.now() - started < 60_000) {
    await sleep(2000);
    if (opts.stillWanted && !opts.stillWanted()) throw new Error("The faucet wait ended: the wallet switched accounts.");
    try {
      const now = await balanceOf(account);
      if (now !== before) return now;
    } catch {
      /* a dropped poll is not a failed faucet */
    }
  }
  throw new Error("The faucet did not credit the account within 60 s. Try again.");
}

export const txUrl = (hash: string) => `${EXPLORER_URL}/tx/${hash}`;
export const addressUrl = (address: string) => `${EXPLORER_URL}/address/${address}`;
export const tenderPath = (id: string) => `/tender/${id}`;
