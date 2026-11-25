// What a visitor is told whenever they wait, in five plain lines: what is happening and who it waits for,
// how long (or a countdown), whether anything is needed from them now, whether they can leave and where
// things will be, and where the money is. One set of words per state of a tender for each of the three
// people who can be looking at it (the buyer, a bidder, anyone else), and for every wait the site itself
// causes: a wallet prompt, a transaction on its way, the validators reading, the demo clerk at work.
//
// Pure, with no React: the tender, its bids, the viewer and the chain's clock in, the words out. The
// waiting panel (components/wait-panel.tsx) prints a guide; tests/unit/guide.test.mjs runs every state for
// every role. Nothing here may promise what contracts/tender.py does not do.

import { gen, span, when } from "./format.ts";
import { bondWhere } from "./money.ts";
import { maskMarks, maskSummary } from "./parse.ts";
import type { Bid, DemoMove, Tender, WriteFn } from "./types.ts";

export type Role = "buyer" | "bidder" | "visitor";
export type GuideTone = "busy" | "clock" | "act" | "done";

export type Guide = {
  id: string;
  tone: GuideTone;
  kicker: string;
  /** 1. what is happening and who it waits for */
  now: string;
  /** 2. how long, or the exact time */
  time: string;
  /** 3. what is needed from the viewer now */
  need: string;
  mustAct: boolean;
  /** 4. whether the viewer can leave, and where things will be */
  leave: string;
  canLeave: boolean;
  /** 5. where the money is right now */
  money: string;
  /** seconds until the next thing happens on the contract's clock */
  left?: number;
  leftLabel?: string;
};

export const roleOf = (t: Pick<Tender, "buyer">, bids: Bid[], me: string): Role => {
  const m = me.toLowerCase();
  if (m && m === t.buyer) return "buyer";
  if (m && bids.some((b) => b.bidder === m)) return "bidder";
  return "visitor";
};

const LEAVE_OK = "Yes. Everything is on chain; the tender is under My bids when you come back.";
const at = (t: number, now: number) => (t > now ? `${when(t)}, ${span(t - now)} from now` : when(t));

/** The buyer's budget, in a sentence, while the tender is open. */
const budgetLine = (t: Tender) => `The buyer's ${gen(t.budgetAtto)} budget is held in escrow by the contract, not by the buyer.`;

/** The waiting panel of a tender at rest, for one viewer. */
export function tenderGuide(t: Tender, bids: Bid[], me: string, now: number, opts: { demo?: boolean; credit?: string } = {}): Guide {
  const role = roleOf(t, bids, me);
  const mine = bids.find((b) => b.bidder === me.toLowerCase());
  const id = (s: string) => `${t.phase}:${s}:${role}`;
  const left = (x: number) => (x > now ? x - now : 0);
  const base = { canLeave: true, leave: LEAVE_OK };
  const count = t.requirements.length;
  const mineMoney = mine ? `Your ${bondWhere(mine, t)}.` : "";

  if (t.status === "open" && now < t.bidBy) {
    if (mine)
      return { ...base, id: id("sealed"), tone: "clock", kicker: "Sealed", now: "Your bid is sealed. Nobody can see your price or your proposal, not even the buyer.", time: `Bidding closes ${at(t.bidBy, now)}. Then you reveal.`, need: "Nothing now. Keep your reveal slip: without it the bid cannot be opened.", mustAct: false, leave: "Yes. Your bid is on chain and the reveal slip is saved in this browser, under My bids. Come back when bidding closes.", money: mineMoney, left: left(t.bidBy), leftLabel: "to close" };
    if (role === "buyer")
      return { ...base, id: id("buyer"), tone: "clock", kicker: "Taking bids", now: "The notice is up and bids are coming in sealed.", time: `Bidding closes ${at(t.bidBy, now)}.`, need: "Nothing. You cannot bid on your own tender, and you cannot see a bid until its bidder reveals it.", mustAct: false, money: budgetLine(t), left: left(t.bidBy), leftLabel: "to close" };
    return { ...base, id: id("open"), tone: "act", kicker: "Taking bids", now: "The notice is up. Anyone but the buyer may send one sealed bid.", time: `Bidding closes ${at(t.bidBy, now)}.`, need: `Bid if you want to: the site seals your price and proposal and you stake the ${gen(t.bidBondAtto)} bid bond with the call.`, mustAct: false, money: budgetLine(t), left: left(t.bidBy), leftLabel: "to close" };
  }

  if (t.status === "open" && now < t.revealBy) {
    if (mine?.status === "committed")
      return { id: id("reveal"), tone: "act", kicker: "Reveal now", now: "Bidding has closed. Open your envelope: reveal your bid.", time: `The reveal window closes ${at(t.revealBy, now)}.`, need: "Press Reveal. The reveal slip saved in this browser fills in the price, the proposal and the salt.", mustAct: true, leave: `Not until you have revealed. A bid not revealed by ${when(t.revealBy)} loses its bond to the buyer.`, canLeave: false, money: mineMoney, left: left(t.revealBy), leftLabel: "to reveal" };
    if (mine?.status === "over_budget")
      return { ...base, id: id("over"), tone: "done", kicker: "Over budget", now: `Your price is over the budget of ${gen(t.budgetAtto)}, so this bid cannot win.`, time: "It is settled for your bid.", need: "Nothing.", mustAct: false, money: `Your ${gen(mine.bondAtto)} bid bond is back in your credit; withdraw it under My bids.` };
    return { ...base, id: id("wait"), tone: "clock", kicker: "Envelopes opening", now: mine ? "Your bid is open. The other bidders are revealing theirs." : "Bidding has closed. The bidders are opening their envelopes.", time: `The reveal window closes ${at(t.revealBy, now)}.`, need: mine && !mine.mask ? "Nothing needed. You may already press Assess on your row: anyone can, and it is judged the same." : "Nothing. Anyone may press Assess on a revealed bid.", mustAct: false, money: mine ? mineMoney : budgetLine(t), left: left(t.revealBy), leftLabel: "reveals close" };
  }

  if (t.status === "open") {
    // reviewing, or ready to award
    const unplaced = bids.filter((b) => b.compliant && !b.placed);
    if (mine && mine.status === "revealed" && !mine.mask && now < t.reviewBy)
      return { ...base, id: id("assess-mine"), tone: "act", kicker: "Not assessed", now: "Your bid has not been assessed yet. A bid nobody assesses before the review deadline cannot win.", time: `Assess before ${at(t.reviewBy, now)}. Once sent, the validators take about a minute.`, need: "Press Assess on your row. Anyone can send it, and the caller chooses nothing.", mustAct: false, money: mineMoney, left: left(t.reviewBy), leftLabel: "to assess" };
    if (mine && mine.status === "revealed" && mine.mask && !mine.compliant && !mine.appeal && !mine.challenge && now < mine.appealUntil) {
      const short = maskMarks(mine.mask, count).map((m, i) => (m !== "MEETS" ? i + 1 : 0)).filter(Boolean);
      return { ...base, id: id("appeal"), tone: "act", kicker: "Appeal window", now: `Your bid reads short on requirement ${short.join(" and ")}: it ${maskSummary(mine.mask, count)}.`, time: `You may appeal once, until ${when(mine.appealUntil)}.`, need: `If you think the network misread your proposal, appeal with a reason. The appeal bond, ${gen(t.bidBondAtto)}, comes from your credit${opts.credit !== undefined ? ` (you hold ${gen(opts.credit)})` : ""}. Your reason is shown beside the proposal and does not count as part of it.`, mustAct: false, money: `${mineMoney} An upheld appeal sends the appeal bond to the buyer; an overturned one leaves it with you.`, left: left(mine.appealUntil), leftLabel: "to appeal" };
    }
    const target = bids.find((b) => b.compliant && !b.challenge && b.bidder !== me.toLowerCase() && now < b.appealUntil);
    const mayChallenge = role === "buyer" || mine?.status === "revealed";
    if (target && mayChallenge)
      return { ...base, id: id("challenge"), tone: "act", kicker: "Challenge window", now: `${target.id} reads all MEETS. If you think it does not really commit to a requirement, you may challenge it once.`, time: `Until ${when(target.appealUntil)}.`, need: `Optional. A challenge stakes ${gen(t.bidBondAtto)} from your credit and gives a reason, which is not evidence.`, mustAct: false, money: "A knockout (some requirement MISSES in both orders) pays you the bid's bond as well as your own back; an upheld challenge pays your bond to the challenged bidder.", left: left(target.appealUntil), leftLabel: "to challenge" };
    if (unplaced.length)
      return { ...base, id: id("place"), tone: "act", kicker: "Not yet placed", now: `${unplaced.map((b) => b.id).join(", ")} ${unplaced.length > 1 ? "are" : "is"} compliant but not yet in the ordered list, and the award waits for every compliant bid to be placed.`, time: "One cheap transaction each, no model; under a minute.", need: "Anyone may press Place. The site works out where it goes, and the contract checks both neighbours.", mustAct: false, money: mine ? mineMoney : budgetLine(t) };
    if (t.awardReady)
      return { ...base, id: id("ready"), tone: "act", kicker: "Ready to award", now: "Every window has closed. Anyone may now award the tender; the rule picks the winner, not the caller.", time: opts.demo ? "The demo clerk can do it on request; under a minute." : "Under a minute once sent.", need: "Press Award, or wait for somebody else to.", mustAct: false, money: budgetLine(t) };
    const waitFor = Math.max(t.appealUntil, bids.some((b) => b.status === "revealed" && !b.mask) ? t.reviewBy : 0);
    const myLine = mine?.compliant
      ? now < mine.appealUntil
        ? `Your bid meets every requirement. Its challenge window is open until ${when(mine.appealUntil)}; the buyer or a rival may challenge it once.`
        : "Your bid meets every requirement."
      : mine?.challenge === "knocked_out"
        ? "Your bid was knocked out by a challenge."
        : mine?.appeal
          ? `Your appeal was ${mine.appeal}.`
          : "";
    return { ...base, id: id("review"), tone: "clock", kicker: "Under review", now: `${myLine ? myLine + " " : ""}The award waits for every second-look window to close and every revealed bid to be assessed or the review deadline to pass.`, time: waitFor > now ? `The award can be made from ${at(waitFor, now)}.` : "Any moment now.", need: "Nothing. Nobody can be stopped from assessing, placing or awarding.", mustAct: false, money: mine ? mineMoney : budgetLine(t), left: left(waitFor), leftLabel: "to award" };
  }

  if (t.status === "awarded") {
    const winnerMe = t.winner?.bidder === me.toLowerCase();
    const claim = t.claimableAt ? `the winner can claim it from ${when(t.claimableAt)}` : "the winner can claim it later";
    if (winnerMe)
      return { ...base, id: id("won"), tone: "done", kicker: "Awarded to you", now: `You won at ${gen(t.winner!.priceAtto)}. The price is held for you by the contract.`, time: `The buyer can release it at any time; ${claim}.`, need: opts.demo ? "Nothing. In the demo the school releases the payment on request." : "Nothing now.", mustAct: false, money: `${gen(t.winner!.priceAtto)} held by the contract for you. Your bid bond can be reclaimed to your credit.` };
    if (role === "buyer")
      return { ...base, id: id("buyer"), tone: "act", kicker: "Awarded", now: `Awarded to ${t.winner?.bid} at ${gen(t.winner?.priceAtto)}. Release the price when the work is done.`, time: `${claim[0].toUpperCase()}${claim.slice(1)} if you do not.`, need: "Press Release when satisfied. A dispute only holds the claim for thirty days; it cannot take the money back.", mustAct: false, money: `${gen(t.priceAtto)} held for the winner; ${gen(t.returnedAtto)} already back with you.` };
    return { ...base, id: id("awarded"), tone: "done", kicker: "Awarded", now: `Awarded to ${t.winner?.bid} at ${gen(t.winner?.priceAtto)}, the cheapest bid that meets every requirement.`, time: `The buyer releases the price, or ${claim}.`, need: mine && mine.status === "revealed" && !mine.bondTo ? "Reclaim your bid bond to your credit (anyone may send it)." : "Nothing.", mustAct: false, money: mine ? mineMoney : `${gen(t.priceAtto)} held for the winner; ${gen(t.returnedAtto)} back with the buyer.` };
  }

  const closed = t.status === "paid" ? `The price, ${gen(t.priceAtto)}, went to the winner ${t.winner?.bid}.` : t.status === "waived" ? `The winner gave the price, ${gen(t.priceAtto)}, back to the buyer.` : "No bid met every requirement.";
  return { ...base, id: id("closed"), tone: "done", kicker: t.status === "paid" ? "Paid" : t.status === "waived" ? "Waived" : "No award", now: `Closed. ${closed}`, time: `Closed ${when(t.closedAt || t.awardedAt)}.`, need: mine && mine.status === "revealed" && !mine.bondTo ? "Reclaim your bid bond to your credit, then withdraw it under My bids." : "Nothing.", mustAct: false, money: `${gen(t.returnedAtto)} of the budget went back to the buyer${t.status === "paid" ? `, ${gen(t.priceAtto)} to the winner` : ""}.${mine ? " " + mineMoney : ""}` };
}

// ---- the waits the site itself causes ---------------------------------------------------------------

const NOUN: Record<WriteFn, string> = {
  deposit: "your deposit",
  withdraw: "your withdrawal",
  open_tender: "your tender notice",
  bid: "your sealed bid",
  reveal: "your reveal",
  forfeit: "the forfeit",
  assess: "the assessment",
  appeal: "your appeal",
  challenge: "your challenge",
  place: "the placement",
  reclaim: "the reclaim",
  award: "the award",
  complete: "the payment",
  dispute: "the dispute",
  waive: "the waiver",
  claim_payment: "your claim",
};

const MONEY_SENT: Partial<Record<WriteFn, string>> = {
  open_tender: "The budget leaves your wallet only if the call is taken; a refused notice returns every atto in the same transaction.",
  bid: "The bond leaves your wallet only if the bid is taken; a refused bid returns it in the same transaction.",
  deposit: "The value is held as your credit once the call is final.",
};

const judged = (fn: WriteFn) => fn === "assess" || fn === "appeal" || fn === "challenge";

/** Studio v0.123 charges a small network fee on every write; the wallet shows it as part of what it sends. */
export const FEE_NOTE = "Studio also charges a small network fee: the wallet sends a deposit of about 0.1 GEN with the call, and what the transaction does not use comes back when it is final.";

/** While the wallet asks for a signature. */
export function signGuide(fn: WriteFn): Guide {
  return { id: `sign:${fn}`, tone: "busy", kicker: "Your wallet", now: `Your wallet is asking you to sign ${NOUN[fn]}.`, time: "As long as you take. Nothing is sent until you sign.", need: "Check the call in the wallet and sign it, or cancel. The amount includes the small network fee.", mustAct: true, leave: "Not yet: the wallet prompt belongs to this page.", canLeave: false, money: (MONEY_SENT[fn] ?? "Nothing moves until you sign.") + " " + FEE_NOTE };
}

/** While a sent transaction goes through. */
export function sendingGuide(fn: WriteFn): Guide {
  return {
    id: `sending:${fn}`,
    tone: "busy",
    kicker: judged(fn) ? "Validators reading" : "On its way",
    now: judged(fn) ? `The validators are reading the proposal against every requirement, in both orders, for ${NOUN[fn]}.` : `The network is taking ${NOUN[fn]}. No model runs for it.`,
    time: judged(fn) ? "Usually one to three minutes." : "Usually under a minute.",
    need: "Nothing. Do not send it twice.",
    mustAct: false,
    leave: "Yes. The transaction goes on without this page; its result is on the tender when you come back.",
    canLeave: true,
    money: MONEY_SENT[fn] ?? "Nothing moves until it is final.",
  };
}

const DEMO_NOW: Record<DemoMove | "asking", string> = {
  asking: "The site is asking the demo clerk.",
  open: "The demo school is pinning up a fresh notice, then the two rivals bid on it.",
  bid: "A demo rival is sending its sealed bid.",
  reveal: "A demo rival is opening its envelope.",
  assess: "The validators are reading the proposal against every requirement, in both orders.",
  place: "The demo clerk is placing a compliant bid in the ordered list.",
  award: "The demo clerk is awarding the tender by the rule.",
  complete: "The demo school is releasing the payment to the winner.",
  reclaim: "The demo clerk is returning a held bond to its bidder's credit.",
};

export function demoGuide(move: DemoMove | "asking"): Guide {
  return {
    id: `demo:${move}`,
    tone: "busy",
    kicker: "Demo clerk",
    now: DEMO_NOW[move],
    time: move === "asking" ? "A few seconds." : move === "assess" ? "Usually one to three minutes." : move === "open" ? "About a minute for the notice, then a minute for the bids." : "Usually under a minute.",
    need: "Nothing.",
    mustAct: false,
    leave: "Yes. The clerk's transaction goes on without this page.",
    canLeave: true,
    money: move === "open" ? "The demo school's budget goes into escrow; none of yours moves." : move === "complete" ? "The price goes from escrow to the winner." : "None of yours moves.",
  };
}
