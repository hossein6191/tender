// Every view answer of contracts/tender.py mapped into the page shapes of lib/types.ts. Every missing or
// malformed field gets a safe default, so a page never shows "undefined". Pure, so node runs it in
// tests/unit/parse.test.mjs.

import type { Bid, BidStatus, MyRow, Paged, Phase, Stats, Tender, TenderRow, TenderStatus, Token } from "./types.ts";

type Row = Record<string, unknown>;

export const num = (v: unknown, dflt = 0): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : dflt;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "string" && /^-?\d+$/.test(v.trim())) return Number(v);
  return dflt;
};
export const str = (v: unknown, dflt = ""): string => (v === undefined || v === null ? dflt : String(v));
export const atto = (v: unknown): string => {
  if (typeof v === "bigint") return v >= 0n ? v.toString() : "0";
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? BigInt(Math.trunc(v)).toString() : "0";
  const s = str(v, "0").trim();
  return /^\d+$/.test(s) ? s.replace(/^0+(?=\d)/, "") : "0";
};
const addr = (v: unknown): string => (/^0x[0-9a-fA-F]{40}$/.test(str(v)) ? str(v).toLowerCase() : "");
/** Seconds; the contract writes -1 or 0 when a call had no readable clock. */
const secs = (v: unknown): number => Math.max(0, num(v));
export const asRow = (v: unknown): Row => (v && typeof v === "object" && !Array.isArray(v) ? (v as Row) : {});
const rowsOf = (v: unknown): Row[] => (Array.isArray(v) ? v.filter((r): r is Row => !!r && typeof r === "object" && !Array.isArray(r)) : []);
const idOr = (v: unknown, prefix: "T" | "B"): string => (new RegExp(`^${prefix}[1-9]\\d{0,8}$`).test(str(v)) ? str(v) : "");
const hex64 = (v: unknown): string => (/^[0-9a-f]{64}$/.test(str(v)) ? str(v) : "");

export function parseView(raw: unknown): unknown {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

const STATUSES: TenderStatus[] = ["open", "awarded", "paid", "waived", "no_award"];
const PHASES: Phase[] = ["bidding", "revealing", "reviewing", "ready_to_award", "awarded", "paid", "waived", "no_award"];
const BID_STATUSES: BidStatus[] = ["committed", "revealed", "over_budget", "forfeited"];
const pick = <T extends string>(v: unknown, list: readonly T[], dflt: T): T => (list.includes(str(v) as T) ? (str(v) as T) : dflt);

/** tender(id): null when the register holds no such tender. */
export function mapTender(raw: unknown): Tender | null {
  const r = asRow(parseView(raw));
  if ("error" in r || !idOr(r.tender, "T")) return null;
  const w = asRow(r.winner);
  return {
    id: str(r.tender),
    buyer: addr(r.buyer),
    title: str(r.title),
    scope: str(r.scope),
    requirements: Array.isArray(r.requirements) ? r.requirements.map((x) => str(x)) : [],
    budgetAtto: atto(r.budget),
    bidBondAtto: atto(r.bid_bond),
    openedAt: secs(r.opened_at),
    bidBy: secs(r.bid_by),
    revealBy: secs(r.reveal_by),
    reviewBy: secs(r.review_by),
    completeBy: secs(r.complete_by),
    status: pick(r.status, STATUSES, "open"),
    phase: pick(r.phase, PHASES, "bidding"),
    bids: num(r.bids),
    eligible: num(r.eligible),
    overBudget: num(r.over_budget),
    forfeited: num(r.forfeited),
    assessed: num(r.assessed),
    compliant: num(r.compliant),
    appeals: num(r.appeals),
    challenges: num(r.challenges),
    appealUntil: secs(r.appeal_until),
    leader: idOr(r.leader, "B"),
    leaderPriceAtto: atto(r.leader_price),
    placed: num(r.placed),
    winner: idOr(w.bid, "B") ? { bid: str(w.bid), bidder: addr(w.bidder), priceAtto: atto(w.price) } : null,
    priceAtto: atto(r.price),
    returnedAtto: atto(r.returned),
    awardedAt: secs(r.awarded_at),
    disputedAt: secs(r.disputed_at),
    claimableAt: secs(r.claimable_at),
    closedAt: secs(r.closed_at),
    now: secs(r.now),
    awardReady: r.award_ready === true,
  };
}

const oneOf = <T extends string>(v: unknown, list: readonly T[]): T | "" => (list.includes(str(v) as T) ? (str(v) as T) : "");

export function mapBid(raw: unknown): Bid | null {
  const r = asRow(parseView(raw));
  if ("error" in r || !idOr(r.bid, "B")) return null;
  return {
    id: str(r.bid),
    tender: idOr(r.tender, "T"),
    bidder: addr(r.bidder),
    number: num(r.number),
    commitment: hex64(r.commitment),
    at: secs(r.at),
    bondAtto: atto(r.bond),
    status: pick(r.status, BID_STATUSES, "committed"),
    priceAtto: atto(r.price),
    proposal: str(r.proposal),
    salt: str(r.salt),
    revealedAt: secs(r.revealed_at),
    mask: str(r.mask),
    fingerprint: hex64(r.fingerprint),
    assessedAt: secs(r.assessed_at),
    compliant: r.compliant === true,
    appealUntil: secs(r.appeal_until),
    appeal: oneOf(r.appeal, ["overturned", "upheld"] as const),
    appealReason: str(r.appeal_reason),
    appealMask: str(r.appeal_mask),
    appealFingerprint: hex64(r.appeal_fingerprint),
    appealBondTo: str(r.appeal_bond_to),
    bondTo: str(r.bond_to),
    placed: r.placed === true,
    prev: idOr(r.prev, "B"),
    next: idOr(r.next, "B"),
    challenge: oneOf(r.challenge, ["knocked_out", "upheld"] as const),
    challenger: addr(r.challenger),
    challengeReason: str(r.challenge_reason),
    challengeMask: str(r.challenge_mask),
    replacedMask: str(r.replaced_mask),
    challengeFingerprint: hex64(r.challenge_fingerprint),
    challengeBondTo: str(r.challenge_bond_to),
  };
}

function paged<T>(raw: unknown, map: (r: Row) => T | null): Paged<T> {
  const v = asRow(parseView(raw));
  if ("error" in v) return { total: 0, offset: 0, limit: 20, rows: [] };
  if (!Array.isArray(v.rows)) throw new Error("could not reach the network");
  return { total: num(v.total), offset: num(v.offset), limit: num(v.limit, 20), rows: rowsOf(v.rows).map(map).filter((x): x is T => x !== null) };
}

export const mapBidPage = (raw: unknown): Paged<Bid> => paged(raw, (r) => mapBid(r));

export const mapTenderPage = (raw: unknown): Paged<TenderRow> =>
  paged(raw, (r) =>
    idOr(r.tender, "T") ? { id: str(r.tender), buyer: addr(r.buyer), title: str(r.title), status: pick(r.status, STATUSES, "open"), budgetAtto: atto(r.budget), bidBy: secs(r.bid_by), bids: num(r.bids) } : null,
  );

export const mapMyPage = (raw: unknown): Paged<MyRow> =>
  paged(raw, (r) => (idOr(r.tender, "T") ? { id: str(r.tender), role: str(r.role) === "buyer" ? "buyer" : "bidder", bid: idOr(r.bid, "B"), title: str(r.title), status: pick(r.status, STATUSES, "open") } : null));

export const mapCredit = (raw: unknown): string => atto(asRow(parseView(raw)).credit);

export function mapStats(raw: unknown): Stats {
  const r = asRow(parseView(raw));
  return {
    tenders: num(r.tenders),
    bids: num(r.bids),
    awarded: num(r.awarded),
    noAward: num(r.no_award),
    paid: num(r.paid),
    waived: num(r.waived),
    assessed: num(r.assessed),
    appeals: num(r.appeals),
    overturned: num(r.overturned),
    challenges: num(r.challenges),
    knockedOut: num(r.knocked_out),
    refunds: num(r.refunds),
    creditsHeldAtto: atto(r.credits_held),
    budgetsHeldAtto: atto(r.budgets_held),
    bondsHeldAtto: atto(r.bonds_held),
    paidTotalAtto: atto(r.paid_total),
    returnedTotalAtto: atto(r.returned_total),
    toBuyersTotalAtto: atto(r.to_buyers_total),
    balanceOwedAtto: atto(r.balance_owed),
    now: secs(r.now),
  };
}

// ---- the mask ------------------------------------------------------------------------------------

const TOKENS: Token[] = ["MEETS", "MISSES", "UNCLEAR"];

/**
 * A stored mask as one mark per requirement. "" stands for a requirement not judged yet (no mask), and a
 * mask that does not have exactly one known token per requirement is shown as every requirement UNCLEAR,
 * as the contract's own _clean_mask() would store it.
 */
export function maskMarks(mask: string, count: number): (Token | "")[] {
  if (!mask) return Array.from({ length: count }, () => "");
  const parts = mask.split(",");
  if (parts.length !== count || !parts.every((p) => TOKENS.includes(p as Token))) return Array.from({ length: count }, () => "UNCLEAR");
  return parts as Token[];
}

export const meetsAll = (mask: string, count: number): boolean => count >= 1 && mask === Array(Math.min(count, 6)).fill("MEETS").join(",");
export const missesAny = (mask: string): boolean => mask.split(",").includes("MISSES");

/** "meets every requirement", "misses 2", "misses 2; unclear on 3". */
export function maskSummary(mask: string, count: number): string {
  if (!mask) return "not assessed yet";
  const marks = maskMarks(mask, count);
  if (marks.every((m) => m === "MEETS")) return "meets every requirement";
  const at = (t: Token) => marks.map((m, i) => (m === t ? i + 1 : 0)).filter(Boolean);
  const parts: string[] = [];
  const miss = at("MISSES");
  const unclear = at("UNCLEAR");
  if (miss.length) parts.push(`misses requirement${miss.length > 1 ? "s" : ""} ${miss.join(" and ")}`);
  if (unclear.length) parts.push(`unclear on requirement${unclear.length > 1 ? "s" : ""} ${unclear.join(" and ")}`);
  return parts.join("; ");
}
