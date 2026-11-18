// The shapes the pages use, with no runtime code. lib/parse.ts maps every view answer of
// contracts/tender.py into these, and lib/chain-mock.ts answers in the contract's own JSON, so the same
// mappers run in both modes. Every instant is seconds on the message clock, 0 until it happens; every
// amount is a decimal string of atto.

export type TenderStatus = "open" | "awarded" | "paid" | "waived" | "no_award";
export type Phase = "bidding" | "revealing" | "reviewing" | "ready_to_award" | "awarded" | "paid" | "waived" | "no_award";
export type BidStatus = "committed" | "revealed" | "over_budget" | "forfeited";
export type Token = "MEETS" | "MISSES" | "UNCLEAR";

/** tender(id): the notice, its counts, its leader, its phase by the chain's clock. */
export type Tender = {
  id: string;
  buyer: string;
  title: string;
  scope: string;
  requirements: string[];
  budgetAtto: string;
  bidBondAtto: string;
  openedAt: number;
  bidBy: number;
  revealBy: number;
  reviewBy: number;
  completeBy: number;
  status: TenderStatus;
  phase: Phase;
  bids: number;
  eligible: number;
  overBudget: number;
  forfeited: number;
  assessed: number;
  compliant: number;
  appeals: number;
  challenges: number;
  /** the last appeal or challenge window on the tender closes then */
  appealUntil: number;
  leader: string;
  leaderPriceAtto: string;
  placed: number;
  winner: { bid: string; bidder: string; priceAtto: string } | null;
  priceAtto: string;
  returnedAtto: string;
  awardedAt: number;
  disputedAt: number;
  claimableAt: number;
  closedAt: number;
  /** the view's own clock; 0 when it had none */
  now: number;
  awardReady: boolean;
};

/** One bid, as bids_of() and bid_of() show it. A sealed bid has no price and no proposal yet. */
export type Bid = {
  id: string;
  tender: string;
  bidder: string;
  /** its place in commitment order on its tender: 1 for the first */
  number: number;
  commitment: string;
  at: number;
  bondAtto: string;
  status: BidStatus;
  priceAtto: string;
  proposal: string;
  salt: string;
  revealedAt: number;
  mask: string;
  fingerprint: string;
  assessedAt: number;
  compliant: boolean;
  /** its appeal or challenge window closes then */
  appealUntil: number;
  appeal: "" | "overturned" | "upheld";
  appealReason: string;
  appealMask: string;
  appealFingerprint: string;
  appealBondTo: string;
  /** "" while the bond is held; credit, buyer or challenger once it went */
  bondTo: string;
  placed: boolean;
  prev: string;
  next: string;
  challenge: "" | "knocked_out" | "upheld";
  challenger: string;
  challengeReason: string;
  challengeMask: string;
  replacedMask: string;
  challengeFingerprint: string;
  challengeBondTo: string;
};

export type TenderRow = { id: string; buyer: string; title: string; status: TenderStatus; budgetAtto: string; bidBy: number; bids: number };
export type MyRow = { id: string; role: "buyer" | "bidder"; bid: string; title: string; status: TenderStatus };
export type Paged<T> = { total: number; offset: number; limit: number; rows: T[] };

export type Stats = {
  tenders: number;
  bids: number;
  awarded: number;
  noAward: number;
  paid: number;
  waived: number;
  assessed: number;
  appeals: number;
  overturned: number;
  challenges: number;
  knockedOut: number;
  refunds: number;
  creditsHeldAtto: string;
  budgetsHeldAtto: string;
  bondsHeldAtto: string;
  paidTotalAtto: string;
  returnedTotalAtto: string;
  toBuyersTotalAtto: string;
  balanceOwedAtto: string;
  now: number;
};

export type Rules = Record<string, unknown>;
export type Votes = { agree: number; disagree: number; idle: number };

export type TxStatus = {
  /** PENDING | PROPOSING | COMMITTING | REVEALING | ACCEPTED | FINALIZED | CANCELED | UNDETERMINED | UNKNOWN */
  status: string;
  votes: Votes;
  applied: boolean | null;
  undetermined: boolean;
  exec: string | null;
  result: Record<string, unknown> | null;
  message: string;
};

export type ReadResult<T> = { data: T; source: "chain" | "mock" };

export type WriteFn =
  | "deposit"
  | "withdraw"
  | "open_tender"
  | "bid"
  | "reveal"
  | "forfeit"
  | "assess"
  | "appeal"
  | "challenge"
  | "place"
  | "reclaim"
  | "award"
  | "complete"
  | "dispute"
  | "waive"
  | "claim_payment";

export type Arg = string | number;
export type Call = { fn: WriteFn; args: Arg[]; value?: bigint };

/** What the demo clerk can be asked to do. */
export type DemoMove = "open" | "bid" | "reveal" | "assess" | "place" | "award" | "complete" | "reclaim";

/** GET /api/demo/status: whether the demo clerk can act now, its three public addresses, its newest tender. */
export type DemoStatus = {
  online: boolean;
  reason: string;
  buyer: string;
  rivalA: string;
  rivalB: string;
  /** the newest tender the demo buyer opened, or "" */
  tender: string;
  phase: Phase | "";
};

export type DemoAnswer = { ok: true; hash: string; note?: string } | { ok: false; reason: string; retryAfter?: number };
