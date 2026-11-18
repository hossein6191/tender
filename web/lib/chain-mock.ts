// Mock mode (NEXT_PUBLIC_MOCK=1): an in-memory copy of contracts/tender.py, for local checks and for showing
// the pages with no wallet and no network. It answers in the contract's own JSON, so the mappers of
// lib/parse.ts run in both modes, and it moves money with the contract's integer rules.
//
// No model is asked here. A proposal meets a requirement when it holds every significant word of it (by
// the word's first five letters), misses it when it holds none, and is unclear otherwise; a reason is
// never counted. On chain every validator asks its own model, in two orders. A reload starts again, with
// the demo tender just opened and both rivals' bids sealed.

import { notify } from "./browser-store.ts";
import { commitmentOf } from "./commit.ts";
import { RULES_COPY } from "./contract-rules.ts";
import { DEMO_BUDGET, DEMO_OPEN_ARGS, RIVALS, demoTurn, type DemoAddrs, type RivalKey } from "./demo-script.ts";
import { mapBidPage, mapTender } from "./parse.ts";
import { STAGES } from "./rpc.ts";
import type { Arg, Call, DemoAnswer, DemoMove, DemoStatus, TxStatus } from "./types.ts";

const GEN = 10n ** 18n;
const APPEAL = 1200;
const GRACE = 2 * 86400;
const HOLD = 30 * 86400;

export const MOCK_CONTRACT = "0x0000000000000000000000000000000000007e4d";
export const MOCK_DEMO: DemoAddrs = {
  buyer: "0x00000000000000000000000000000000000e1a51",
  "rival-a": "0x000000000000000000000000000000000000b21a",
  "rival-b": "0x000000000000000000000000000000000000c1ea",
};
export const PERSONAS = [
  { address: "0x0000000000000000000000000000000000000a11", name: "You", note: "a decorator bidding" },
  { address: "0x0000000000000000000000000000000000000b22", name: "Second visitor", note: "another bidder, or a buyer" },
];

type T = {
  buyer: string; title: string; scope: string; requirements: string[]; budget: bigint; bid_bond: bigint; opened_at: number; bid_by: number; reveal_by: number; review_by: number; complete_by: number;
  status: string; bids: number; eligible: number; over_budget: number; forfeited: number; assessed: number; compliant: number; appeals: number; challenges: number; appeal_until: number;
  head: string; placed: number; winner: string; price: bigint; returned: bigint; awarded_at: number; disputed_at: number; closed_at: number; ids: string[];
};
type B = {
  tender: string; bidder: string; number: number; commitment: string; at: number; bond: bigint; status: string; price: bigint; proposal: string; salt: string; revealed_at: number;
  mask: string; fingerprint: string; assessed_at: number; compliant: boolean; appeal_until: number; appeal: string; appeal_reason: string; appeal_mask: string; appeal_fingerprint: string;
  appeal_bond_to: string; bond_to: string; placed: boolean; prev: string; next: string; challenge: string; challenger: string; challenge_reason: string; challenge_mask: string;
  replaced_mask: string; challenge_fingerprint: string; challenge_bond_to: string;
};

const state = {
  persona: PERSONAS[0].address,
  offset: 0,
  balances: new Map<string, bigint>([...PERSONAS.map((p) => [p.address, 10n * GEN] as [string, bigint]), ...Object.values(MOCK_DEMO).map((a) => [a, 20n * GEN] as [string, bigint])]),
  credit: new Map<string, bigint>(),
  tenders: new Map<string, T>(),
  bids: new Map<string, B>(),
  party: new Map<string, string[]>(),
  counts: { bids: 0, awarded: 0, no_award: 0, paid: 0, waived: 0, assessed: 0, appeals: 0, overturned: 0, challenges: 0, knocked_out: 0, refunds: 0 },
  totals: { paid: 0n, returned: 0n, to_buyers: 0n },
  txs: new Map<string, { at: number; result: Record<string, unknown> | null; error: string; judged: boolean }>(),
};

export const mockNow = (): number => Math.floor(Date.now() / 1000) + state.offset;
export const mockClockOffset = (): number => state.offset;
export const mockAddress = (): string => state.persona;
export function setMockPersona(a: string): void {
  state.persona = a.toLowerCase();
  notify();
}
export function advanceClock(seconds: number): void {
  state.offset += seconds;
  notify();
}
export const mockBalanceText = (a: string): string => (state.balances.get(a.toLowerCase()) ?? 0n).toString();

class Expected extends Error {}
const fail = (m: string): never => {
  throw new Expected(m);
};
const bal = (a: string) => state.balances.get(a) ?? 0n;
const pay = (to: string, v: bigint) => state.balances.set(to, bal(to) + v);
const credit = (a: string) => state.credit.get(a) ?? 0n;
const setCredit = (a: string, v: bigint) => state.credit.set(a, v);
const index = (who: string, tid: string) => state.party.set(who, [...(state.party.get(who) ?? []), tid]);

// ---- the judge -----------------------------------------------------------------------------------------

const STOP = new Set(["the", "a", "an", "of", "for", "and", "with", "all", "will", "uses", "use", "using", "within", "every", "each", "by", "to", "in", "on", "is", "are", "be"]);
const stems = (t: string) => new Set(t.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w && !STOP.has(w)).map((w) => w.slice(0, 5)));

/** The mock's mask: one token per requirement, from the words the proposal shares with it. */
export function mockMask(requirements: string[], proposal: string): string {
  const have = stems(proposal);
  return requirements
    .map((r) => {
      const need = [...stems(r)];
      const got = need.filter((w) => have.has(w)).length;
      return got === need.length ? "MEETS" : got === 0 || (need.length > 1 && got <= need.length / 2) ? "MISSES" : "UNCLEAR";
    })
    .join(",");
}

// ---- the contract ----------------------------------------------------------------------------------

const before = (a: B, b: B) => a.price < b.price || (a.price === b.price && a.number < b.number);
const knownT = (id: Arg) => (state.tenders.has(String(id)) ? String(id) : fail("no tender " + String(id).slice(0, 12)));
const knownB = (id: Arg) => (state.bids.has(String(id)) ? String(id) : fail("no bid " + String(id).slice(0, 12)));
const refuse = (sender: string, value: bigint, reason: string) => {
  state.counts.refunds++;
  if (value > 0n) pay(sender, value);
  return { ok: false, reason, returned: value.toString() };
};
const meetsAll = (mask: string, n: number) => mask === Array(n).fill("MEETS").join(",");
const link = (t: T, id: string, x: B, after: string) => {
  let nxt: string;
  if (after) {
    const a = state.bids.get(after)!;
    nxt = a.next;
    a.next = id;
  } else {
    nxt = t.head;
    t.head = id;
  }
  x.prev = after;
  x.next = nxt;
  if (nxt) state.bids.get(nxt)!.prev = id;
  x.placed = true;
  t.placed++;
};
const tryHead = (t: T, id: string, x: B) => {
  if (!t.head || before(x, state.bids.get(t.head)!)) link(t, id, x, "");
};
const openWindow = (t: T, x: B, now: number) => {
  x.appeal_until = now + APPEAL;
  if (x.appeal_until > t.appeal_until) t.appeal_until = x.appeal_until;
};
const claimableAt = (t: T) => Math.max(t.complete_by + GRACE, t.disputed_at ? t.disputed_at + HOLD : 0);
const isRival = (tid: string, me: string) => [...state.bids.values()].some((b) => b.tender === tid && b.bidder === me && b.status === "revealed");
const reasonOk = (r: string) => (r.trim().length >= 20 && r.length <= 400 ? "" : "the reason is 20 to 400 characters");

function run(sender: string, value: bigint, fn: string, a: Arg[]): Record<string, unknown> {
  const now = mockNow();
  if (fn === "deposit") {
    if (value <= 0n) return refuse(sender, value, "send the value to hold as credit for bonds with this call");
    setCredit(sender, credit(sender) + value);
    return { ok: true, deposited: value.toString(), credit: credit(sender).toString() };
  }
  if (fn === "withdraw") {
    const amount = BigInt(String(a[0] || "0"));
    if (amount < 1n || amount > credit(sender)) fail(`withdraw 1 to ${credit(sender)} atto, the credit this address holds, written in digits`);
    setCredit(sender, credit(sender) - amount);
    pay(sender, amount);
    return { ok: true, returned: amount.toString(), credit: credit(sender).toString() };
  }
  if (fn === "open_tender") {
    const [title, scope, reqs, bond, bidBy, revealBy, reviewBy, completeBy] = a;
    const requirements = String(reqs).split("|").map((r) => r.trim());
    if (value < GEN / 10n || value > 1000n * GEN) return refuse(sender, value, `send the maximum budget with this call: 0.1 to 1000 GEN; this sends ${value}`);
    if (Number(bidBy) < now + 600) return refuse(sender, value, `bid_by is a unix time from 600 seconds to 90 days after now, ${now}, written in digits`);
    if (Number(revealBy) < Number(bidBy) + 600) return refuse(sender, value, "reveal_by is ten minutes to seven days after bid_by");
    if (Number(reviewBy) < Number(revealBy) + 600) return refuse(sender, value, "review_by is ten minutes to seven days after reveal_by");
    if (Number(completeBy) < Number(reviewBy) + APPEAL) return refuse(sender, value, "complete_by is from 1200 seconds to 365 days after review_by");
    const tid = "T" + (state.tenders.size + 1);
    state.tenders.set(tid, {
      buyer: sender, title: String(title).trim(), scope: String(scope).trim(), requirements, budget: value, bid_bond: BigInt(String(bond)), opened_at: now, bid_by: Number(bidBy), reveal_by: Number(revealBy),
      review_by: Number(reviewBy), complete_by: Number(completeBy), status: "open", bids: 0, eligible: 0, over_budget: 0, forfeited: 0, assessed: 0, compliant: 0, appeals: 0, challenges: 0,
      appeal_until: 0, head: "", placed: 0, winner: "", price: 0n, returned: 0n, awarded_at: 0, disputed_at: 0, closed_at: 0, ids: [],
    });
    index(sender, tid);
    return { ok: true, tender: tid, budget: value.toString(), bid_bond: String(bond), requirements: requirements.length, bid_by: Number(bidBy), reveal_by: Number(revealBy), review_by: Number(reviewBy), complete_by: Number(completeBy) };
  }
  if (fn === "bid") {
    const tid = String(a[0]);
    if (!state.tenders.has(tid)) return refuse(sender, value, "no tender " + tid);
    const t = state.tenders.get(tid)!;
    const bond = t.bid_bond;
    const digest = String(a[1]).trim().toLowerCase();
    let problem = "";
    if (sender === t.buyer) problem = `the buyer of ${tid} may not bid on it`;
    else if (t.status !== "open") problem = `${tid} is ${t.status} and takes no bid`;
    else if (now >= t.bid_by) problem = `bidding on ${tid} closed at ${t.bid_by}`;
    else if (t.ids.some((id) => state.bids.get(id)!.bidder === sender)) problem = `this address has already bid on ${tid}; one bid per address`;
    else if (!/^[0-9a-f]{64}$/.test(digest)) problem = 'the commitment is sha256(price_atto + "|" + proposal + "|" + salt), written as 64 hexadecimal characters';
    else if (t.ids.some((id) => state.bids.get(id)!.commitment === digest)) problem = `this commitment was already made on ${tid}; a copied bid is refused`;
    else if (value !== 0n && value !== bond) problem = `send exactly the bid bond, ${bond} atto, or send nothing to stake it from credit; this sends ${value}`;
    else if (value === 0n && credit(sender) < bond) problem = `the bid bond, ${bond} atto, is taken from credit when nothing is sent, and this address holds ${credit(sender)}; send it with the call, or deposit() it first`;
    if (problem) return refuse(sender, value, problem);
    if (value === 0n) setCredit(sender, credit(sender) - bond);
    state.counts.bids++;
    const id = "B" + state.counts.bids;
    t.bids++;
    t.ids.push(id);
    index(sender, tid);
    state.bids.set(id, {
      tender: tid, bidder: sender, number: t.bids, commitment: digest, at: now, bond, status: "committed", price: 0n, proposal: "", salt: "", revealed_at: 0, mask: "", fingerprint: "", assessed_at: 0,
      compliant: false, appeal_until: 0, appeal: "", appeal_reason: "", appeal_mask: "", appeal_fingerprint: "", appeal_bond_to: "", bond_to: "", placed: false, prev: "", next: "", challenge: "",
      challenger: "", challenge_reason: "", challenge_mask: "", replaced_mask: "", challenge_fingerprint: "", challenge_bond_to: "",
    });
    return { ok: true, bid: id, tender: tid, number: t.bids, bond: bond.toString(), from_credit: value === 0n, reveal_from: t.bid_by, reveal_by: t.reveal_by };
  }
  // every other call names a bid or a tender
  if (["reveal", "forfeit", "assess", "appeal", "challenge", "place", "reclaim"].includes(fn)) {
    const id = knownB(a[0]);
    const x = state.bids.get(id)!;
    const t = state.tenders.get(x.tender)!;
    const n = t.requirements.length;
    if (fn === "reveal") {
      if (sender !== x.bidder) fail(`only the bidder who committed ${id} may reveal it`);
      if (x.status !== "committed") fail(`${id} is ${x.status}; a bid is revealed once`);
      if (now < t.bid_by) fail(`reveals on ${x.tender} open when bidding closes, at ${t.bid_by}`);
      if (now >= t.reveal_by) fail(`reveals on ${x.tender} closed at ${t.reveal_by}; the bond of an unrevealed bid goes to the buyer`);
      const price = BigInt(String(a[1]));
      if (commitmentOf(price, String(a[2]), String(a[3])) !== x.commitment) fail(`this price, proposal and salt do not match the commitment of ${id}`);
      Object.assign(x, { price, proposal: String(a[2]), salt: String(a[3]), revealed_at: now });
      if (price > t.budget) {
        Object.assign(x, { status: "over_budget", bond_to: "credit" });
        setCredit(x.bidder, credit(x.bidder) + x.bond);
        t.over_budget++;
        return { ok: false, bid: id, status: "over_budget", price: price.toString(), budget: t.budget.toString(), reason: `the price is over the budget of ${x.tender}, so this bid cannot win; its bond is back in credit` };
      }
      x.status = "revealed";
      t.eligible++;
      return { ok: true, bid: id, status: "revealed", price: price.toString(), bond: x.bond.toString(), bond_held_until: "the tender is decided", review_by: t.review_by };
    }
    if (fn === "forfeit") {
      if (x.status !== "committed") fail(`${id} is ${x.status}; only a bid never revealed forfeits its bond`);
      if (now < t.reveal_by) fail(`reveals on ${x.tender} are open for another ${t.reveal_by - now} seconds`);
      Object.assign(x, { status: "forfeited", bond_to: "buyer" });
      t.forfeited++;
      pay(t.buyer, x.bond);
      state.totals.to_buyers += x.bond;
      return { ok: true, bid: id, status: "forfeited", bond: x.bond.toString(), to: "buyer" };
    }
    if (fn === "assess") {
      if (x.status !== "revealed") fail(`${id} is ${x.status}; only a bid revealed within budget is assessed`);
      if (x.mask) fail(`${id} was assessed and reads ${x.mask}; an assessment is final, and only its bidder's one appeal looks again`);
      if (now >= t.review_by) fail(`the review window of ${x.tender} closed at ${t.review_by}; a bid not assessed by then cannot win`);
      Object.assign(x, { mask: mockMask(t.requirements, x.proposal), fingerprint: "ab".repeat(32), assessed_at: now });
      t.assessed++;
      state.counts.assessed++;
      openWindow(t, x, now);
      if (meetsAll(x.mask, n)) {
        x.compliant = true;
        t.compliant++;
        tryHead(t, id, x);
      }
      return { ok: true, bid: id, tender: x.tender, mask: x.mask, compliant: x.compliant, window_until: x.appeal_until, placed: x.placed, leader: t.head };
    }
    if (fn === "appeal") {
      if (sender !== x.bidder) fail(`only the bidder of ${id} may appeal its assessment`);
      if (x.status !== "revealed" || !x.mask) fail(`${id} has no assessment to appeal`);
      if (x.compliant) fail(`${id} already meets every requirement`);
      if (x.appeal) fail(`${id} was appealed once already and the appeal was ${x.appeal}`);
      if (x.challenge) fail(`${id} was knocked out by a challenge, which was its second look; it takes no appeal`);
      if (now >= x.appeal_until) fail(`the appeal window of ${id} closed at ${x.appeal_until}`);
      const p = reasonOk(String(a[1]));
      if (p) fail(p);
      if (credit(sender) < t.bid_bond) fail(`an appeal stakes a bond of ${t.bid_bond} atto from credit, which holds ${credit(sender)}; deposit() it first`);
      const mask = mockMask(t.requirements, x.proposal);
      Object.assign(x, { appeal_reason: String(a[1]).trim(), appeal_mask: mask, appeal_fingerprint: "cd".repeat(32) });
      t.appeals++;
      state.counts.appeals++;
      if (meetsAll(mask, n)) {
        Object.assign(x, { appeal: "overturned", appeal_bond_to: "credit", mask, compliant: true });
        t.compliant++;
        state.counts.overturned++;
        openWindow(t, x, now);
        tryHead(t, id, x);
        return { ok: true, bid: id, appeal: "overturned", mask, compliant: true, window_until: x.appeal_until, leader: t.head };
      }
      Object.assign(x, { appeal: "upheld", appeal_bond_to: "buyer" });
      setCredit(sender, credit(sender) - t.bid_bond);
      pay(t.buyer, t.bid_bond);
      state.totals.to_buyers += t.bid_bond;
      return { ok: true, bid: id, appeal: "upheld", mask: x.mask, appeal_mask: mask, compliant: false, bond: t.bid_bond.toString(), bond_to: "buyer" };
    }
    if (fn === "challenge") {
      if (sender === x.bidder) fail(`the bidder of ${id} may not challenge its own bid`);
      if (sender !== t.buyer && !isRival(x.tender, sender)) fail(`only the buyer of ${x.tender} or another bidder with a bid revealed within budget may challenge`);
      if (!x.compliant) fail(`${id} does not meet every requirement; only a compliant bid is challenged`);
      if (x.challenge) fail(`${id} was challenged once already and the challenge was ${x.challenge}`);
      if (t.status !== "open") fail(`${x.tender} is ${t.status}; a challenge comes before the award`);
      if (now >= x.appeal_until) fail(`the challenge window of ${id} closed at ${x.appeal_until}`);
      const p = reasonOk(String(a[1]));
      if (p) fail(p);
      if (credit(sender) < t.bid_bond) fail(`a challenge stakes a bond of ${t.bid_bond} atto from credit, which holds ${credit(sender)}; deposit() it first`);
      const mask = mockMask(t.requirements, x.proposal);
      Object.assign(x, { challenger: sender, challenge_reason: String(a[1]).trim(), challenge_mask: mask, challenge_fingerprint: "ef".repeat(32) });
      t.challenges++;
      state.counts.challenges++;
      if (mask.split(",").includes("MISSES")) {
        Object.assign(x, { challenge: "knocked_out", challenge_bond_to: "credit", replaced_mask: x.mask, mask, compliant: false, bond_to: "challenger" });
        t.compliant--;
        if (x.placed) {
          if (x.prev) state.bids.get(x.prev)!.next = x.next;
          else t.head = x.next;
          if (x.next) state.bids.get(x.next)!.prev = x.prev;
          Object.assign(x, { prev: "", next: "", placed: false });
          t.placed--;
        }
        setCredit(sender, credit(sender) + x.bond);
        state.counts.knocked_out++;
        return { ok: true, bid: id, challenge: "knocked_out", mask, replaced_mask: x.replaced_mask, taken: x.bond.toString(), leader: t.head };
      }
      Object.assign(x, { challenge: "upheld", challenge_bond_to: "bidder" });
      setCredit(sender, credit(sender) - t.bid_bond);
      setCredit(x.bidder, credit(x.bidder) + t.bid_bond);
      return { ok: true, bid: id, challenge: "upheld", mask: x.mask, challenge_mask: mask, bond: t.bid_bond.toString(), bond_to: "bidder", leader: t.head };
    }
    if (fn === "place") {
      if (!x.compliant) fail(`${id} does not meet every requirement; only a compliant bid is placed`);
      if (x.placed) fail(`${id} is placed already`);
      if (t.status !== "open") fail(`${x.tender} is ${t.status}; its bids are no longer placed`);
      const after = String(a[1] ?? "").trim();
      if (!after) {
        if (t.head && !before(x, state.bids.get(t.head)!)) fail(`${id} does not come before the leader ${t.head}; place it after a placed bid`);
      } else {
        const p = state.bids.get(after);
        if (!p || p.tender !== x.tender || !p.placed) fail(`${after} is not a placed bid of ${x.tender}`);
        if (!before(p!, x)) fail(`${id} does not come after ${after}`);
        if (p!.next && !before(x, state.bids.get(p!.next)!)) fail(`${id} does not come before ${p!.next}, which follows ${after}`);
      }
      link(t, id, x, after);
      return { ok: true, bid: id, after, next: x.next, leader: t.head, placed: t.placed, compliant: t.compliant };
    }
    // reclaim
    if (x.status !== "revealed" || x.bond_to) fail(`${id} holds no bond to reclaim`);
    if (t.status === "open") fail(`${x.tender} is not decided yet; a revealed bid's bond is held until the award, so that a challenge that knocks it out can pay the challenger`);
    x.bond_to = "credit";
    setCredit(x.bidder, credit(x.bidder) + x.bond);
    return { ok: true, bid: id, bond: x.bond.toString(), credit: credit(x.bidder).toString() };
  }
  const tid = knownT(a[0]);
  const t = state.tenders.get(tid)!;
  if (fn === "award") {
    if (t.status !== "open") fail(`${tid} is ${t.status}; it was decided at ${t.awarded_at}`);
    if (now < t.reveal_by) fail(`reveals on ${tid} are open until ${t.reveal_by}; the award waits for them`);
    if (now < t.appeal_until) fail(`an appeal or challenge window on ${tid} is open until ${t.appeal_until}; the award waits for it`);
    if (t.assessed < t.eligible && now < t.review_by) fail(`${t.eligible - t.assessed} of the ${t.eligible} bids revealed on ${tid} are not assessed yet; anyone may assess() them, or the award waits until review_by, ${t.review_by}`);
    if (t.placed < t.compliant) fail(`${t.compliant - t.placed} compliant bids on ${tid} are not placed yet; anyone may place() them`);
    t.awarded_at = now;
    let back = t.budget;
    if (t.head) {
      const w = state.bids.get(t.head)!;
      Object.assign(t, { status: "awarded", winner: t.head, price: w.price });
      back = t.budget - w.price;
      state.counts.awarded++;
    } else {
      Object.assign(t, { status: "no_award", closed_at: now });
      state.counts.no_award++;
    }
    t.returned = back;
    state.totals.returned += back;
    if (back > 0n) pay(t.buyer, back);
    return { ok: true, tender: tid, status: t.status, winner: t.winner, price: t.price.toString(), returned: back.toString(), claimable_at: t.winner ? claimableAt(t) : 0 };
  }
  const winner = t.winner ? state.bids.get(t.winner)!.bidder : "";
  const payOut = (how: string) => {
    Object.assign(t, { status: "paid", closed_at: now });
    pay(winner, t.price);
    state.totals.paid += t.price;
    state.counts.paid++;
    return { ok: true, tender: tid, status: "paid", paid: t.price.toString(), to: winner, how };
  };
  if (fn === "complete") {
    if (sender !== t.buyer) fail(`only the buyer of ${tid} may release its payment`);
    if (t.status !== "awarded") fail(`${tid} is ${t.status}; only an awarded tender's price is released`);
    return payOut("the buyer released it");
  }
  if (fn === "dispute") {
    if (sender !== t.buyer) fail(`only the buyer of ${tid} may dispute it`);
    if (t.status !== "awarded") fail(`${tid} is ${t.status}; only an awarded tender is disputed`);
    if (t.disputed_at) fail(`${tid} was disputed at ${t.disputed_at}; a tender is disputed once`);
    if (now >= t.complete_by + GRACE) fail(`the winner's claim on ${tid} opened at ${t.complete_by + GRACE}; a dispute must come before it`);
    t.disputed_at = now;
    return { ok: true, tender: tid, disputed_at: now, claimable_at: claimableAt(t) };
  }
  if (fn === "waive") {
    if (t.status !== "awarded") fail(`${tid} is ${t.status}; only an awarded tender's price is waived`);
    if (sender !== winner) fail(`only the winner of ${tid} may waive its price`);
    Object.assign(t, { status: "waived", closed_at: now });
    pay(t.buyer, t.price);
    state.totals.returned += t.price;
    state.counts.waived++;
    return { ok: true, tender: tid, status: "waived", returned: t.price.toString() };
  }
  if (fn === "claim_payment") {
    if (t.status !== "awarded") fail(`${tid} is ${t.status}; only an awarded tender's price is claimed`);
    if (sender !== winner) fail(`only the winner of ${tid} may claim its price`);
    if (now < claimableAt(t)) fail(`the claim on ${tid} opens at ${claimableAt(t)}, in ${claimableAt(t) - now} seconds`);
    return payOut("the winner claimed it");
  }
  return fail("no such method " + fn);
}

let txN = 0;
function send(sender: string, value: bigint, fn: string, args: Arg[]): string {
  const hash = "0x" + (++txN).toString(16).padStart(8, "0") + "7e4d".repeat(14);
  if (value > bal(sender)) throw new Error("insufficient funds for this call");
  if (value > 0n) state.balances.set(sender, bal(sender) - value);
  try {
    const result = run(sender, value, fn, args);
    state.txs.set(hash, { at: Date.now(), result, error: "", judged: ["assess", "appeal", "challenge"].includes(fn) });
  } catch (e) {
    if (value > 0n) pay(sender, value);
    const msg = e instanceof Expected ? `[EXPECTED] ${e.message}` : String(e instanceof Error ? e.message : e);
    state.txs.set(hash, { at: Date.now(), result: null, error: msg, judged: false });
  }
  setTimeout(notify, 50);
  return hash;
}

export async function write(call: Call): Promise<string> {
  return send(state.persona, call.value ?? 0n, call.fn, call.args);
}

export async function txStatus(hash: string): Promise<TxStatus> {
  const t = state.txs.get(hash);
  if (!t) return { status: "UNKNOWN", votes: { agree: 0, disagree: 0, idle: 0 }, applied: null, undetermined: false, exec: null, result: null, message: "" };
  const step = t.judged ? 1100 : 450;
  const i = Math.min(STAGES.length - 1, Math.floor((Date.now() - t.at) / step));
  const voted = i >= 3;
  return { status: STAGES[i], votes: voted ? { agree: 5, disagree: 0, idle: 0 } : { agree: 0, disagree: 0, idle: 0 }, applied: voted ? true : null, undetermined: false, exec: t.error ? "ERROR" : "SUCCESS", result: t.error ? null : t.result, message: t.error || JSON.stringify(t.result) };
}

export async function balanceOf(a: string): Promise<bigint> {
  return bal(a.toLowerCase());
}

export async function faucet(a: string): Promise<bigint> {
  pay(a.toLowerCase(), 10n * GEN);
  notify();
  return bal(a.toLowerCase());
}

// ---- views, in the contract's own JSON -----------------------------------------------------------

function tenderView(tid: string): Record<string, unknown> {
  const t = state.tenders.get(tid);
  if (!t) return { error: "no tender " + tid };
  const now = mockNow();
  const ready = t.status === "open" && now >= t.reveal_by && now >= t.appeal_until && (t.assessed >= t.eligible || now >= t.review_by) && t.placed >= t.compliant;
  const phase = t.status !== "open" ? t.status : now < t.bid_by ? "bidding" : now < t.reveal_by ? "revealing" : ready ? "ready_to_award" : "reviewing";
  const w = t.winner ? state.bids.get(t.winner)! : null;
  return {
    tender: tid, buyer: t.buyer, title: t.title, scope: t.scope, requirements: t.requirements, budget: t.budget.toString(), bid_bond: t.bid_bond.toString(), opened_at: t.opened_at, bid_by: t.bid_by,
    reveal_by: t.reveal_by, review_by: t.review_by, complete_by: t.complete_by, status: t.status, phase, bids: t.bids, eligible: t.eligible, over_budget: t.over_budget, forfeited: t.forfeited,
    assessed: t.assessed, compliant: t.compliant, appeals: t.appeals, challenges: t.challenges, appeal_until: t.appeal_until, leader: t.head,
    leader_price: t.head ? state.bids.get(t.head)!.price.toString() : "0", placed: t.placed, winner: w ? { bid: t.winner, bidder: w.bidder, price: w.price.toString() } : null,
    price: t.price.toString(), returned: t.returned.toString(), awarded_at: t.awarded_at, disputed_at: t.disputed_at, claimable_at: t.status === "awarded" ? claimableAt(t) : 0, closed_at: t.closed_at, now, award_ready: ready,
  };
}

const bidRow = (id: string) => {
  const x = state.bids.get(id)!;
  return { bid: id, ...x, bond: x.bond.toString(), price: x.price.toString() };
};
const page = (total: number, offset: number, limit: number) => {
  const start = Math.max(0, offset);
  const size = Math.min(Math.max(limit, 1), 20);
  return { start, count: Math.min(Math.max(total - start, 0), size), size };
};

export async function view(fn: string, args: Arg[]): Promise<string> {
  if (fn === "tender") return JSON.stringify(tenderView(String(args[0])));
  if (fn === "tenders") {
    const p = page(state.tenders.size, Number(args[0]), Number(args[1]));
    const rows = Array.from({ length: p.count }, (_, i) => {
      const tid = "T" + (p.start + 1 + i);
      const t = state.tenders.get(tid)!;
      return { tender: tid, buyer: t.buyer, title: t.title, status: t.status, budget: t.budget.toString(), bid_by: t.bid_by, bids: t.bids };
    });
    return JSON.stringify({ total: state.tenders.size, offset: p.start, limit: p.size, rows });
  }
  if (fn === "tenders_of") {
    const who = String(args[0]).toLowerCase();
    const list = state.party.get(who) ?? [];
    const p = page(list.length, Number(args[1]), Number(args[2]));
    const rows = list.slice(p.start, p.start + p.count).map((tid) => {
      const t = state.tenders.get(tid)!;
      const mine = t.ids.find((id) => state.bids.get(id)!.bidder === who) ?? "";
      return { tender: tid, role: who === t.buyer ? "buyer" : "bidder", bid: mine, title: t.title, status: t.status };
    });
    return JSON.stringify({ who, total: list.length, offset: p.start, limit: p.size, rows });
  }
  if (fn === "bids_of") {
    const t = state.tenders.get(String(args[0]));
    if (!t) return JSON.stringify({ error: "no tender " + String(args[0]) });
    const p = page(t.ids.length, Number(args[1]), Number(args[2]));
    return JSON.stringify({ tender: String(args[0]), total: t.ids.length, offset: p.start, limit: p.size, rows: t.ids.slice(p.start, p.start + p.count).map(bidRow) });
  }
  if (fn === "bid_of") return JSON.stringify(state.bids.has(String(args[0])) ? bidRow(String(args[0])) : { error: "no bid " + String(args[0]) });
  if (fn === "credit") return JSON.stringify({ who: String(args[0]).toLowerCase(), credit: credit(String(args[0]).toLowerCase()).toString() });
  if (fn === "stats") {
    const budgets = [...state.tenders.values()].reduce((s, t) => s + (t.status === "open" ? t.budget : t.status === "awarded" ? t.price : 0n), 0n);
    const bonds = [...state.bids.values()].reduce((s, b) => s + ((b.status === "committed" || b.status === "revealed") && !b.bond_to ? b.bond : 0n), 0n);
    const credits = [...state.credit.values()].reduce((s, v) => s + v, 0n);
    const c = state.counts;
    return JSON.stringify({
      tenders: state.tenders.size, bids: c.bids, awarded: c.awarded, no_award: c.no_award, paid: c.paid, waived: c.waived, assessed: c.assessed, appeals: c.appeals, overturned: c.overturned,
      challenges: c.challenges, knocked_out: c.knocked_out, refunds: c.refunds, credits_held: credits.toString(), budgets_held: budgets.toString(), bonds_held: bonds.toString(),
      paid_total: state.totals.paid.toString(), returned_total: state.totals.returned.toString(), to_buyers_total: state.totals.to_buyers.toString(), balance_owed: (credits + budgets + bonds).toString(), now: mockNow(),
    });
  }
  if (fn === "rules") return JSON.stringify(RULES_COPY);
  return JSON.stringify({ error: "no view " + fn });
}

// ---- the demo clerk, in the browser -----------------------------------------------------------------

const mockSalt = (tid: string, rival: RivalKey) => (tid + rival + "salt").replace(/[^A-Za-z0-9]/g, "").padEnd(24, "x");
const newestDemo = (): string => [...state.tenders.entries()].filter(([, t]) => t.buyer === MOCK_DEMO.buyer).map(([id]) => id).pop() ?? "";

function openDemo(): string {
  const hash = send(MOCK_DEMO.buyer, DEMO_BUDGET, "open_tender", DEMO_OPEN_ARGS(mockNow()));
  const tid = newestDemo();
  for (const r of RIVALS) send(MOCK_DEMO[r.key], state.tenders.get(tid)!.bid_bond, "bid", [tid, commitmentOf(r.priceAtto, r.proposal, mockSalt(tid, r.key))]);
  return hash;
}
openDemo();

export async function demoStatus(): Promise<DemoStatus> {
  const tid = newestDemo();
  const v = tid ? mapTender(tenderView(tid)) : null;
  return { online: true, reason: "", buyer: MOCK_DEMO.buyer, rivalA: MOCK_DEMO["rival-a"], rivalB: MOCK_DEMO["rival-b"], tender: tid, phase: v?.phase ?? "" };
}

export async function demoMove(move: DemoMove, target: { tender?: string; bid?: string; rival?: string }): Promise<DemoAnswer> {
  const tid = target.tender || newestDemo();
  const t = tid ? mapTender(tenderView(tid)) : null;
  const bids = t ? mapBidPage(await view("bids_of", [tid, 0, 20])).rows : [];
  const m = demoTurn(move === "open" ? (tid === newestDemo() ? t : null) : t, bids, MOCK_DEMO, mockNow(), { move, bid: target.bid, rival: target.rival });
  if (typeof m === "string") return { ok: false, reason: m };
  if (m.move === "open") return { ok: true, hash: openDemo() };
  if (m.move === "bid") {
    const r = RIVALS.find((x) => x.key === m.rival)!;
    return { ok: true, hash: send(MOCK_DEMO[r.key], BigInt(t!.bidBondAtto), "bid", [tid, commitmentOf(r.priceAtto, r.proposal, mockSalt(tid, r.key))]) };
  }
  if (m.move === "reveal") {
    const r = RIVALS.find((x) => x.key === m.rival)!;
    return { ok: true, hash: send(MOCK_DEMO[r.key], 0n, "reveal", [m.bid!, r.priceAtto.toString(), r.proposal, mockSalt(tid, r.key)]) };
  }
  if (m.move === "assess" || m.move === "reclaim") return { ok: true, hash: send(MOCK_DEMO.buyer, 0n, m.move, [m.bid!]) };
  if (m.move === "place") return { ok: true, hash: send(MOCK_DEMO.buyer, 0n, "place", [m.bid!, m.after ?? ""]) };
  return { ok: true, hash: send(MOCK_DEMO.buyer, 0n, m.move, [tid]) };
}
