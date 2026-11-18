"use client";

// The sealed bid. The visitor picks a prepared bid or writes their own price and proposal; the page seals
// it in this browser (commitment = sha256 of price, proposal and a fresh salt), saves the reveal slip in
// localStorage before anything is signed, offers it as a file and as text to copy, and only then sends
// bid() with the bond. Nothing but the commitment leaves the browser until the reveal.

import * as React from "react";

import { Button } from "@/components/button";
import { Envelope } from "@/components/envelope";
import { IconCopy, IconDownload } from "@/components/icons";
import { calls } from "@/lib/calls";
import { newSalt, sealedProposal } from "@/lib/commit";
import { VISITOR_CHIPS } from "@/lib/demo-script";
import { gen, parseGen } from "@/lib/format";
import { proposalProblem } from "@/lib/rules";
import { saveSlip, slipFileName, slipFor, slipText, type Slip } from "@/lib/slips";
import type { Call, Tender } from "@/lib/types";

export function SlipActions({ slip }: { slip: Slip }) {
  const [copied, setCopied] = React.useState(false);
  const download = () => {
    const url = URL.createObjectURL(new Blob([slipText(slip)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = slipFileName(slip);
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(slipText(slip));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="plain" icon={<IconDownload />} onClick={download}>
        Download reveal slip
      </Button>
      <Button size="sm" variant="plain" icon={<IconCopy />} onClick={() => void copy()}>
        {copied ? "Copied" : "Copy slip"}
      </Button>
    </div>
  );
}

export function BidForm({ t, me, demo, busy, send }: { t: Tender; me: string; demo: boolean; busy: boolean; send: (call: Call, label: string) => void }) {
  const [price, setPrice] = React.useState("");
  const [proposal, setProposal] = React.useState("");
  const [salt, setSalt] = React.useState("");
  const [slip, setSlip] = React.useState<Slip | null>(null);
  const priceAtto = parseGen(price);
  const text = sealedProposal(proposal);
  const problem = !priceAtto || priceAtto < 1n ? "Write a price in GEN, such as 0.8." : proposalProblem(text) ? proposalProblem(text) + "." : "";
  const over = priceAtto !== null && priceAtto > BigInt(t.budgetAtto);

  const choose = (c: (typeof VISITOR_CHIPS)[number]) => {
    setPrice(c.priceText);
    setProposal(c.proposal);
    setSlip(null);
  };
  const seal = () => {
    if (problem || !priceAtto) return;
    const s = slipFor({ tender: t.id, bidder: me, priceAtto: priceAtto.toString(), proposal: text, salt: salt || newSalt() });
    saveSlip(s);
    setSalt(s.salt);
    setSlip(s);
  };
  const edit = () => {
    setSlip(null);
    setSalt("");
  };

  return (
    <section className="sheet pinned px-4 pt-6 pb-4" aria-labelledby="bid-title">
      <h2 id="bid-title" className="head text-[22px] font-bold">
        Send a sealed bid
      </h2>
      <p className="mt-1 text-[14px] text-ink-2">Your price and proposal stay in this browser until you reveal them. Only their commitment goes on chain now, with the {gen(t.bidBondAtto)} bid bond.</p>
      {demo && (
        <div className="mt-3">
          <p className="form-label">Start from</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {VISITOR_CHIPS.map((c) => (
              <button key={c.key} type="button" className="chip" aria-pressed={proposal === c.proposal && price === c.priceText} onClick={() => choose(c)} disabled={!!slip}>
                {c.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <label className="mt-3 block">
        <span className="form-label">Price, in GEN</span>
        <input className="field mono mt-1 !w-40 text-[18px]" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} disabled={!!slip} placeholder="0.8" />
      </label>
      {over && <p className="mt-1 text-[13px] text-amber">This is over the budget of {gen(t.budgetAtto)}: it will be recorded as over budget and cannot win, though its bond comes back.</p>}
      <label className="mt-3 block">
        <span className="form-label">Proposal: what you commit to do ({text.length} of 40 to 1200 characters, one line)</span>
        <textarea className="field mt-1 min-h-28" value={proposal} onChange={(e) => setProposal(e.target.value.replace(/\s*\n\s*/g, " "))} disabled={!!slip} placeholder="We will paint all 12 classrooms with low-VOC paint and finish within the summer break." />
      </label>
      <p className="mt-1 text-[12.5px] text-ink-3">The network will ask, requirement by requirement, whether your proposal commits to it. Say it plainly: a promise that is only implied reads as unclear.</p>
      {!slip ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button onClick={seal} disabled={!!problem}>
            Seal it
          </Button>
          {problem && (price || proposal) && <span className="text-[13px] text-no">{problem}</span>}
        </div>
      ) : (
        <div className="mt-4 border border-dashed border-wax bg-[#fff8f1] p-3">
          <div className="flex items-center gap-3">
            <Envelope open={false} label="Sealed envelope" size={52} />
            <div className="min-w-0">
              <p className="head text-[17px] font-bold">Sealed. Save your reveal slip.</p>
              <p className="text-[13px] text-ink-2">It is kept in this browser already. Without it this bid cannot be revealed, and an unrevealed bid loses its bond to the buyer.</p>
            </div>
          </div>
          <p className="mono mt-2 text-[12px] break-all text-ink-2">commitment {slip.commitment}</p>
          <div className="mt-2.5">
            <SlipActions slip={slip} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => send(calls.bid(t.id, slip.commitment, BigInt(t.bidBondAtto)), `bid() on ${t.id}, sealed, with the ${gen(t.bidBondAtto)} bond`)}>
              Send sealed bid · {gen(t.bidBondAtto)} bond
            </Button>
            <Button variant="plain" onClick={edit} disabled={busy}>
              Change it
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
