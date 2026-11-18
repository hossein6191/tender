"use client";

// Open a tender: the visitor becomes the buyer. The notice's title, scope and one to six requirements, the
// budget sent with the call and held in escrow, the bid bond, and the windows in minutes. Every door of the
// contract is checked here first; the contract checks them again, and a refused notice returns every atto.

import Link from "next/link";
import * as React from "react";

import { Button } from "@/components/button";
import { TxStage } from "@/components/tx-stage";
import { useMe } from "@/components/use-me";
import { useTx } from "@/components/use-tx";
import { useWallet } from "@/components/wallet";
import { calls } from "@/lib/calls";
import { isMock, returnedId, tenderPath } from "@/lib/chain";
import { DEMO_REQUIREMENTS, DEMO_SCOPE } from "@/lib/demo-script";
import { gen, parseGen } from "@/lib/format";
import { sendingGuide, signGuide } from "@/lib/guide";
import { MAX_BOND, MAX_BUDGET, MIN_BOND, MIN_BUDGET, pyStrip, requirementsOf, scopeProblem, titleProblem } from "@/lib/rules";
import { mockNow } from "@/lib/chain-mock";

export function OpenView() {
  const me = useMe();
  const wallet = useWallet();
  const [title, setTitle] = React.useState("Repaint the village hall");
  const [scope, setScope] = React.useState(DEMO_SCOPE.replace("the twelve classrooms at Elm Street Primary School", "the main hall and the two side rooms of the village hall"));
  const [reqs, setReqs] = React.useState<string[]>(["Paints the main hall and both side rooms", DEMO_REQUIREMENTS[1], "Finishes before 1 September"]);
  const [budget, setBudget] = React.useState("1");
  const [bond, setBond] = React.useState("0.05");
  const [mins, setMins] = React.useState({ bid: 15, reveal: 10, review: 10, due: 60 * 24 * 7 });
  const tx = useTx();
  const made = returnedId(tx.final, "tender");

  const budgetAtto = parseGen(budget);
  const bondAtto = parseGen(bond);
  const [list, reqProblem] = requirementsOf(reqs.map((r) => pyStrip(r)).join("|"));
  const problem =
    titleProblem(pyStrip(title)) ||
    scopeProblem(pyStrip(scope)) ||
    reqProblem ||
    (!budgetAtto || budgetAtto < MIN_BUDGET || budgetAtto > MAX_BUDGET ? "the budget is 0.1 to 1000 GEN" : "") ||
    (!bondAtto || bondAtto < MIN_BOND || bondAtto > MAX_BOND ? "the bid bond is 0.01 to 10 GEN" : "") ||
    (mins.bid < 12 || mins.reveal < 10 || mins.review < 10 || mins.due < 20 ? "bidding runs at least 12 minutes (the contract needs ten, and the call needs time to land), reveal and review at least 10, and the work is due at least 20 minutes after review" : "");

  const send = () => {
    // A click handler, not render: the deadlines are measured from the moment the notice is sent.
    // eslint-disable-next-line react-hooks/purity
    const now = isMock ? mockNow() : Math.floor(Date.now() / 1000);
    const bidBy = now + mins.bid * 60;
    const revealBy = bidBy + mins.reveal * 60;
    const reviewBy = revealBy + mins.review * 60;
    void tx.start(calls.openTender(pyStrip(title), pyStrip(scope), list, bondAtto!, bidBy, revealBy, reviewBy, reviewBy + mins.due * 60, budgetAtto!));
  };
  const n = (k: keyof typeof mins) => (
    <label className="block">
      <span className="form-label">{{ bid: "Bidding, minutes", reveal: "Reveal window, minutes", review: "Review window, minutes", due: "Work due, minutes after review" }[k]}</span>
      <input className="field mono mt-1" inputMode="numeric" value={mins[k]} onChange={(e) => setMins({ ...mins, [k]: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })} />
    </label>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start">
      <section className="sheet pinned tilt-l px-4 pt-7 pb-5 sm:px-7">
        <p className="smallcaps text-[13px] text-wax">Form PW-1 · Notice of tender</p>
        <h1 className="head mt-1 text-[30px] font-bold">Open a tender</h1>
        <p className="mt-1 text-[14.5px] text-ink-2">You become the buyer. The budget goes into escrow with the call. You cannot bid on your own tender, and you will not decide which bids comply: the network will.</p>
        <label className="mt-4 block">
          <span className="form-label">Title (3 to 80 characters)</span>
          <input className="field mt-1" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="mt-3 block">
          <span className="form-label">Scope (20 to 600 characters; the model never sees it)</span>
          <textarea className="field mt-1 min-h-20" value={scope} onChange={(e) => setScope(e.target.value.replace(/\s*\n\s*/g, " "))} />
        </label>
        <fieldset className="mt-3">
          <legend className="form-label">Requirements, one to six (5 to 160 characters each, no |)</legend>
          {reqs.map((r, i) => (
            <div key={i} className="mt-1.5 flex items-center gap-2">
              <span className="mono w-6 text-right font-bold">{i + 1}.</span>
              <input className="field" value={r} onChange={(e) => setReqs(reqs.map((x, k) => (k === i ? e.target.value : x)))} />
              {reqs.length > 1 && (
                <button type="button" className="link shrink-0 text-[13px] text-no" onClick={() => setReqs(reqs.filter((_, k) => k !== i))}>
                  remove
                </button>
              )}
            </div>
          ))}
          {reqs.length < 6 && (
            <button type="button" className="link mt-2 text-[14px] text-council" onClick={() => setReqs([...reqs, ""])}>
              Add a requirement
            </button>
          )}
        </fieldset>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="form-label">Maximum budget, GEN</span>
            <input className="field mono mt-1" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} />
          </label>
          <label className="block">
            <span className="form-label">Bid bond, GEN</span>
            <input className="field mono mt-1" inputMode="decimal" value={bond} onChange={(e) => setBond(e.target.value)} />
          </label>
          {n("bid")}
          {n("reveal")}
          {n("review")}
          {n("due")}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {me || isMock ? (
            <Button disabled={!!problem || tx.sending || (!!tx.hash && !tx.final)} onClick={send}>
              Pin the notice · {budgetAtto ? gen(budgetAtto) : "?"} into escrow
            </Button>
          ) : (
            <Button onClick={() => void wallet.connect()}>Connect a wallet</Button>
          )}
          {problem && <span className="text-[13.5px] text-no">{problem[0].toUpperCase() + problem.slice(1)}.</span>}
        </div>
      </section>
      <aside className="flex min-w-0 flex-col gap-4">
        <TxStage tx={tx} sign={signGuide("open_tender")} sending={sendingGuide("open_tender")} label="open_tender()" />
        {made && (
          <div className="sheet pinned px-4 pt-6 pb-4">
            <p className="head text-[20px] font-bold">{made} is pinned up.</p>
            <p className="mt-1 text-[14px] text-ink-2">Bids can come in now. Share the page; anyone but you may bid.</p>
            <Link href={tenderPath(made)} className="btn mt-3">
              <span>Go to {made}</span>
            </Link>
          </div>
        )}
        <div className="sheet-plain px-4 py-3 text-[14px] text-ink-2">
          <p className="head text-[16px] font-bold text-ink">Write requirements a proposal can commit to</p>
          <p className="mt-1">Each requirement is asked as its own question: &ldquo;Does the PROPOSAL commit to requirement k?&rdquo;. One condition each reads best. Prices and dates are checked by code, never by the model, so a requirement about the price is wasted.</p>
        </div>
      </aside>
    </div>
  );
}
