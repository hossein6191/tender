"use client";

// The one second look a bid may get from either side: the bidder's appeal of a mask short of all MEETS, or
// a challenge of a mask of all MEETS by the buyer or a rival with a bid revealed within budget. Both stake
// a bond equal to the bid bond from credit, so when the credit is short the form offers the deposit first.

import * as React from "react";

import { Button } from "@/components/button";
import { calls } from "@/lib/calls";
import { gen } from "@/lib/format";
import { creditShortfall } from "@/lib/money";
import { maskSummary } from "@/lib/parse";
import { pyStrip, reasonProblem } from "@/lib/rules";
import type { Bid, Call, Tender } from "@/lib/types";

const SUGGEST = {
  appeal: "Water-based paint with no solvents is low-VOC paint, and the proposal names the paint it will use.",
  challenge: "The proposal never says the paint is low-VOC, so it does not commit to requirement 2.",
};

export function SecondLook({ kind, t, b, creditAtto, busy, send, onClose }: { kind: "appeal" | "challenge"; t: Tender; b: Bid; creditAtto: string; busy: boolean; send: (call: Call, label: string) => void; onClose: () => void }) {
  const [reason, setReason] = React.useState("");
  const text = pyStrip(reason);
  const problem = reasonProblem(text);
  const short = creditShortfall(t.bidBondAtto, creditAtto);
  return (
    <div className="mt-2 w-full border border-dashed border-ink-3 bg-card-2 p-3">
      <p className="head text-[17px] font-bold">{kind === "appeal" ? `Appeal ${b.id}` : `Challenge ${b.id}`}</p>
      <p className="mt-1 text-[13.5px] text-ink-2">
        {kind === "appeal"
          ? `It ${maskSummary(b.mask, t.requirements.length)}. The same questions are asked again in both orders with your reason beside the proposal; a commitment that appears only in the reason does not count. Every requirement MEETS overturns. Anything else upholds, and the ${gen(t.bidBondAtto)} appeal bond goes to the buyer.`
          : `It reads all MEETS. The same questions are asked again with your reason beside it, which is not evidence. A requirement reading MISSES in both orders knocks it out and pays you its bond; anything else upholds it and your ${gen(t.bidBondAtto)} goes to its bidder.`}
      </p>
      <label className="mt-2 block">
        <span className="form-label">Your reason ({text.length} of 20 to 400 characters)</span>
        <textarea className="field mt-1 min-h-20" value={reason} placeholder={SUGGEST[kind]} onChange={(e) => setReason(e.target.value.replace(/\s*\n\s*/g, " "))} />
      </label>
      <p className="mt-1 text-[13px] text-ink-2">
        Your credit here: <span className="mono">{gen(creditAtto)}</span>. {short > 0n ? `Deposit ${gen(short)} first: the bond comes from credit, never from the call.` : "Enough for the bond."}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {short > 0n ? (
          <Button disabled={busy} onClick={() => send(calls.deposit(short), `deposit() of ${gen(short)} for the ${kind} bond`)}>
            Deposit {gen(short)}
          </Button>
        ) : (
          <Button disabled={busy || !!problem} onClick={() => send(kind === "appeal" ? calls.appeal(b.id, text) : calls.challenge(b.id, text), `${kind}() of ${b.id}, judged`)}>
            Send {kind} · {gen(t.bidBondAtto)} bond from credit
          </Button>
        )}
        <Button variant="plain" onClick={onClose}>
          Not now
        </Button>
        {!reason && (
          <button type="button" className="link text-[13px] text-council" onClick={() => setReason(SUGGEST[kind])}>
            Use the suggested reason
          </button>
        )}
      </div>
    </div>
  );
}
