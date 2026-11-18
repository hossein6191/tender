"use client";

// The bid board: a ruled tabulation sheet with one line per bid in commitment order. Each line shows the
// envelope (sealed in wax, or opened), the price in typewriter figures once revealed, a pencil mark per
// requirement, where the bid stands, and the buttons that apply to it. Opening a line shows the proposal
// as revealed, the salt and commitment, every mask it has carried, and whether its fingerprint matches the
// text, worked out in this browser.

import * as React from "react";

import { Envelope } from "@/components/envelope";
import { Pencil } from "@/components/pencil";
import { Stamp } from "@/components/stamp";
import { commitmentOf, fingerprintOf } from "@/lib/commit";
import { cx } from "@/lib/cx";
import { gen, ordinal, short, when } from "@/lib/format";
import { placedOrder } from "@/lib/money";
import { maskMarks, maskSummary } from "@/lib/parse";
import type { Bid, Tender } from "@/lib/types";

export function standing(t: Tender, bids: Bid[], b: Bid, now: number): { text: string; tone: "ok" | "no" | "amber" | "plain" } {
  const count = t.requirements.length;
  if (t.winner?.bid === b.id) return { text: "Awarded", tone: "ok" };
  if (b.status === "committed") return { text: t.status === "open" && now < t.revealBy ? "Sealed" : "Never revealed", tone: "plain" };
  if (b.status === "forfeited") return { text: "Forfeited: never revealed", tone: "no" };
  if (b.status === "over_budget") return { text: "Over budget", tone: "no" };
  if (b.challenge === "knocked_out") return { text: `Knocked out: ${maskSummary(b.mask, count)}`, tone: "no" };
  if (!b.mask) return { text: "Revealed, not assessed", tone: "plain" };
  if (b.compliant) {
    if (!b.placed) return { text: "Compliant, not placed yet", tone: "amber" };
    const at = placedOrder(t.leader, bids).findIndex((x) => x.id === b.id);
    return { text: at === 0 ? "Compliant · leader" : `Compliant · ${ordinal(at + 1)} in order`, tone: "ok" };
  }
  return { text: maskSummary(b.mask, count)[0].toUpperCase() + maskSummary(b.mask, count).slice(1), tone: "no" };
}

const TONE = { ok: "text-ok", no: "text-no", amber: "text-amber", plain: "text-ink-2" };

export function BidBoard({ t, bids, now, nameOf, actionsFor }: { t: Tender; bids: Bid[]; now: number; nameOf: (address: string) => string; actionsFor: (b: Bid) => React.ReactNode }) {
  const n = t.requirements.length;
  const cols = `2.2rem minmax(0,1.3fr) 3.2rem 6.5rem ${"2rem ".repeat(n)} minmax(0,1.4fr)`;
  return (
    <section aria-labelledby="board-title" className="sheet pinned tilt-r margin-rule overflow-hidden pt-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 sm:px-6">
        <h2 id="board-title" className="head text-[24px] font-bold">
          Tabulation of bids
        </h2>
        <p className="smallcaps text-[13px] text-ink-2">
          {t.bids} received · {t.assessed} assessed · {t.compliant} compliant
        </p>
      </div>
      <div role="table" aria-label="Bids" className="mt-3">
        <div role="row" className="hidden border-y-2 border-ink bg-card px-4 py-1 sm:grid sm:gap-x-2 sm:px-6" style={{ gridTemplateColumns: cols }}>
          {["No.", "Bidder", "", "Price"].map((h, i) => (
            <span key={i} role="columnheader" className="form-label">
              {h}
            </span>
          ))}
          {t.requirements.map((_, i) => (
            <span key={i} role="columnheader" className="form-label text-center" title={t.requirements[i]}>
              R{i + 1}
            </span>
          ))}
          <span role="columnheader" className="form-label">
            Standing
          </span>
        </div>
        {bids.length === 0 && <p className="ruled px-6 py-4 text-ink-2">No bids yet. Sealed bids appear here as envelopes the moment they are taken.</p>}
        <div className="ruled">
          {bids.map((b) => (
            <BidLine key={b.id} t={t} bids={bids} b={b} now={now} cols={cols} name={nameOf(b.bidder)} actions={actionsFor(b)} />
          ))}
        </div>
      </div>
      <p className="border-t border-rule px-4 py-2 text-[12.5px] text-ink-2 sm:px-6">
        <span className="pencil-meets font-bold">✓</span> meets · <span className="pencil-misses font-bold">✗</span> misses · <span className="pencil-unclear font-bold">?</span> unclear (the two orders disagreed, or the answer could not be read). A bid wins only with every requirement ✓.
      </p>
    </section>
  );
}

function BidLine({ t, bids, b, now, cols, name, actions }: { t: Tender; bids: Bid[]; b: Bid; now: number; cols: string; name: string; actions: React.ReactNode }) {
  const n = t.requirements.length;
  const marks = maskMarks(b.mask, n);
  const st = standing(t, bids, b, now);
  const open = b.status !== "committed" && b.status !== "forfeited";
  return (
    <div role="row" className="border-b border-ruled/70 px-4 py-2 sm:px-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:grid sm:gap-x-2" style={{ gridTemplateColumns: cols }}>
        <span role="cell" className="mono font-bold">
          {b.id}
        </span>
        <span role="cell" className="min-w-0 basis-[calc(100%-4rem)] truncate sm:basis-auto">
          <span className="font-semibold">{name}</span> <span className="mono text-[12px] text-ink-3">{short(b.bidder)}</span>
        </span>
        <span role="cell">
          <Envelope open={open} dim={b.status === "forfeited"} label={open ? "Opened envelope" : "Sealed envelope"} />
        </span>
        <span role="cell" className={cx("mono text-[17px] font-bold", b.status === "over_budget" && "text-no line-through")}>
          {open ? gen(b.priceAtto) : "sealed"}
        </span>
        {marks.map((m, i) => (
          <span role="cell" key={i} className="text-center">
            <Pencil mark={m} k={i + 1} />
          </span>
        ))}
        <span role="cell" className={cx("min-w-0 basis-full text-[14px] sm:basis-auto", TONE[st.tone])}>
          {st.text === "Awarded" ? <Stamp size="sm">Awarded</Stamp> : st.text}
          {b.appeal && <span className="block text-[12.5px] text-ink-2">Appeal {b.appeal}</span>}
          {b.challenge === "upheld" && <span className="block text-[12.5px] text-ink-2">Challenge upheld</span>}
        </span>
      </div>
      {actions && <div className="mt-1.5 flex flex-wrap gap-2 sm:pl-[2.7rem]">{actions}</div>}
      <Details t={t} b={b} />
    </div>
  );
}

function Details({ t, b }: { t: Tender; b: Bid }) {
  if (b.status === "committed" || b.status === "forfeited")
    return (
      <p className="mt-1 text-[12.5px] break-all text-ink-3 sm:pl-[2.7rem]">
        Commitment <span className="mono">{b.commitment}</span> · sealed {when(b.at)}
      </p>
    );
  const commitOk = commitmentOf(b.priceAtto, b.proposal, b.salt) === b.commitment;
  const fpOk = b.fingerprint && fingerprintOf(t.requirements, b.proposal) === b.fingerprint;
  return (
    <details className="mt-1 text-[13.5px] sm:pl-[2.7rem]">
      <summary className="cursor-pointer text-council">The proposal, and every look the network took</summary>
      <blockquote className="mt-1.5 border-l-2 border-ink-3 bg-card-2/70 px-3 py-1.5 italic">{b.proposal}</blockquote>
      <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[12.5px]">
        <dt className="form-label">Commitment</dt>
        <dd className="mono break-all">
          {b.commitment} {commitOk ? <span className="text-ok">· matches the price, proposal and salt</span> : <span className="text-no">· does not match</span>}
        </dd>
        <dt className="form-label">Salt</dt>
        <dd className="mono break-all">{b.salt}</dd>
        {b.mask && (
          <>
            <dt className="form-label">Assessed</dt>
            <dd>
              {when(b.assessedAt)}: <span className="mono">{b.replacedMask || (b.appeal === "overturned" ? "" : b.mask)}</span>
              {b.fingerprint && <span className={fpOk ? "text-ok" : "text-amber"}> · fingerprint {fpOk ? "matches this text" : "is for an appeal or challenge text"}</span>}
            </dd>
          </>
        )}
        {b.appeal && (
          <>
            <dt className="form-label">Appeal</dt>
            <dd>
              {b.appeal}, read <span className="mono">{b.appealMask}</span>. Reason: “{b.appealReason}”
            </dd>
          </>
        )}
        {b.challenge && (
          <>
            <dt className="form-label">Challenge</dt>
            <dd>
              {b.challenge === "knocked_out" ? "knocked out" : "upheld"} by <span className="mono">{short(b.challenger)}</span>, read <span className="mono">{b.challengeMask}</span>. Reason: “{b.challengeReason}”
            </dd>
          </>
        )}
      </dl>
    </details>
  );
}
