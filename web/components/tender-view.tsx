"use client";

// One tender on the board: the printed notice and the tabulation of bids on the left; on the right the
// memo that says what is happening and what it waits for, the docket slip of any transaction under way,
// the visitor's own desk (send a sealed bid, reveal it, appeal, challenge, place, award, pay) and, on a demo
// tender, the demo clerk's desk with a button for each move the rivals and the school may make now.

import Link from "next/link";
import * as React from "react";

import { BidBoard } from "@/components/bid-board";
import { BidForm, SlipActions } from "@/components/bid-form";
import { Button } from "@/components/button";
import { DemoStage, useDemoCall } from "@/components/demo-call";
import { ReadProblem } from "@/components/read-state";
import { SecondLook } from "@/components/second-look";
import { Stamp } from "@/components/stamp";
import { TxStage } from "@/components/tx-stage";
import { useDemoStatus } from "@/components/use-demo";
import { useLocal } from "@/components/use-local";
import { useMe } from "@/components/use-me";
import { useNow } from "@/components/use-now";
import { useAfterTx, useRead } from "@/components/use-read";
import { useTender } from "@/components/use-tender";
import { useTx } from "@/components/use-tx";
import { WaitPanel } from "@/components/wait-panel";
import { useWallet } from "@/components/wallet";
import { calls, isJudged } from "@/lib/calls";
import { isMock, readCredit, returnedId, tenderPath } from "@/lib/chain";
import { Notice } from "@/components/notice";
import { RIVALS, demoMoves, type DemoAddrs } from "@/lib/demo-script";
import { gen, when } from "@/lib/format";
import { sendingGuide, signGuide, tenderGuide } from "@/lib/guide";
import { awardReasons, placeHint } from "@/lib/money";
import { parseSlip, readSlip, saveSlip, slipRaw } from "@/lib/slips";
import { rememberTx } from "@/lib/tx-memory";
import type { Bid, Call, Tender, TxStatus } from "@/lib/types";

export function TenderView({ id, compact }: { id: string; compact?: boolean }) {
  const state = useTender(id);
  const demo = useDemoStatus();
  const me = useMe();
  const now = useNow();
  const wallet = useWallet();
  const credit = useRead(async () => readCredit(me), [me], { enabled: !!me });
  useAfterTx(credit.refresh);
  const [look, setLook] = React.useState<{ kind: "appeal" | "challenge"; bid: string } | null>(null);

  const onFinal = React.useCallback(
    (s: TxStatus, hash: string, call: Call) => {
      if (call.fn === "bid") {
        const bid = returnedId(s, "bid");
        const slip = readSlip(id, me);
        if (bid && slip) saveSlip({ ...slip, bid });
      }
      if (call.fn === "appeal" || call.fn === "challenge") setLook(null);
      void hash;
    },
    [id, me],
  );
  const tx = useTx(onFinal);
  const clerk = useDemoCall();
  const busy = tx.sending || (!!tx.hash && !tx.final) || clerk.asking || (!!clerk.tx.hash && !clerk.tx.final);
  const send = (call: Call, label: string) => {
    void tx.start(call).then((h) => h && rememberTx(id, h, label));
  };
  const [lastLabel, setLastLabel] = React.useState("");
  const act = (call: Call, label: string) => {
    setLastLabel(label);
    send(call, label);
  };

  if (!state.data) return <ReadProblem state={state} what={`tender ${id}`} />;
  const { tender: t, bids } = state.data;
  if (!t)
    return (
      <div className="sheet pinned px-5 pt-6 pb-5">
        <p className="head text-[22px]">There is no tender {id} on this register.</p>
        <Link href="/" className="link mt-2 inline-block text-council">
          Back to the noticeboard
        </Link>
      </div>
    );

  const d = demo.data;
  const addrs: DemoAddrs | null = d && d.buyer ? { buyer: d.buyer, "rival-a": d.rivalA, "rival-b": d.rivalB } : isMock && d ? { buyer: d.buyer, "rival-a": d.rivalA, "rival-b": d.rivalB } : null;
  const isDemo = !!addrs && t.buyer === addrs.buyer;
  const nameOf = (a: string) => {
    if (me && a === me) return "You";
    if (addrs && a === addrs.buyer) return "Elm Street Primary School (demo)";
    if (addrs && a === addrs["rival-a"]) return RIVALS[0].name;
    if (addrs && a === addrs["rival-b"]) return RIVALS[1].name;
    if (a === t.buyer) return "The buyer";
    return "A bidder";
  };
  const mine = bids.find((b) => b.bidder === me);
  const creditAtto = credit.data ?? "0";
  const guide = tenderGuide(t, bids, me, now, { demo: isDemo, credit: creditAtto });
  const iAmBuyer = !!me && me === t.buyer;
  const iMayChallenge = iAmBuyer || mine?.status === "revealed";

  const actionsFor = (b: Bid): React.ReactNode => {
    if (!me) return null;
    const out: React.ReactNode[] = [];
    const isMine = b.bidder === me;
    if (isMine && b.status === "committed" && now >= t.bidBy && now < t.revealBy) out.push(<RevealButton key="reveal" t={t} b={b} me={me} busy={busy} send={act} />);
    if (b.status === "revealed" && !b.mask && t.status === "open" && now < t.reviewBy)
      out.push(
        <Button key="assess" size="sm" disabled={busy} onClick={() => act(calls.assess(b.id), `assess() of ${b.id}, judged`)}>
          Assess {b.id}
        </Button>,
      );
    const hint = t.status === "open" ? placeHint(t, bids, b) : null;
    if (hint !== null)
      out.push(
        <Button key="place" size="sm" variant="plain" disabled={busy} onClick={() => act(calls.place(b.id, hint), `place(${b.id}, ${hint ? hint : "the head"})`)}>
          Place {b.id} {hint ? `after ${hint}` : "at the head"}
        </Button>,
      );
    if (isMine && b.status === "revealed" && b.mask && !b.compliant && !b.appeal && !b.challenge && now < b.appealUntil)
      out.push(
        <Button key="appeal" size="sm" variant="danger" disabled={busy} onClick={() => setLook({ kind: "appeal", bid: b.id })}>
          Appeal · {Math.max(0, Math.ceil((b.appealUntil - now) / 60))} min left
        </Button>,
      );
    if (!isMine && iMayChallenge && b.compliant && !b.challenge && t.status === "open" && now < b.appealUntil)
      out.push(
        <Button key="challenge" size="sm" variant="danger" disabled={busy} onClick={() => setLook({ kind: "challenge", bid: b.id })}>
          Challenge · {Math.max(0, Math.ceil((b.appealUntil - now) / 60))} min left
        </Button>,
      );
    if (b.status === "committed" && now >= t.revealBy)
      out.push(
        <Button key="forfeit" size="sm" variant="plain" disabled={busy} onClick={() => act(calls.forfeit(b.id), `forfeit() of ${b.id}: its bond to the buyer`)}>
          Send its bond to the buyer
        </Button>,
      );
    if (b.status === "revealed" && !b.bondTo && t.status !== "open")
      out.push(
        <Button key="reclaim" size="sm" variant="ok" disabled={busy} onClick={() => act(calls.reclaim(b.id), `reclaim() of ${b.id}'s bond`)}>
          Reclaim {b.id}&apos;s bond
        </Button>,
      );
    if (look && look.bid === b.id)
      out.push(<SecondLook key="look" kind={look.kind} t={t} b={b} creditAtto={creditAtto} busy={busy} send={act} onClose={() => setLook(null)} />);
    return out.length ? out : null;
  };

  const moves = isDemo && addrs ? demoMoves(t, bids, addrs, now).filter((m) => m.move !== "open") : [];
  const freshOk = isDemo && addrs ? demoMoves(t, bids, addrs, now).some((m) => m.move === "open") : false;
  const reasons = t.status !== "open" ? awardReasons(t, bids) : null;
  const winnerMe = !!t.winner && t.winner.bidder === me;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:items-start">
      <div className="flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-start-1">
        <Notice t={t} buyerName={nameOf(t.buyer)} now={now} compact={compact} />
        {reasons && (
          <section className="sheet pinned px-4 pt-6 pb-4 sm:px-6" aria-labelledby="award-title">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="award-title" className="head text-[22px] font-bold">
                The award
              </h2>
              <Stamp tone={t.winner ? "ok" : "no"}>{t.winner ? (t.status === "paid" ? "Awarded · paid" : "Awarded") : "No award"}</Stamp>
            </div>
            <p className="mt-2 text-[15px]">{reasons.headline}</p>
            <ul className="mt-2 space-y-1 text-[14px]">
              {reasons.lines.map((l) => (
                <li key={l.bid} className="border-t border-dotted border-rule pt-1">
                  <span className="mono font-bold">{l.bid}</span> <span className="text-ink-2">({nameOf(bids.find((b) => b.id === l.bid)?.bidder ?? "")})</span> {l.line}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <aside className="flex min-w-0 flex-col gap-4 lg:col-start-2 lg:row-span-2 lg:row-start-1">
        {!tx.hash && !tx.sending && !clerk.asking && !clerk.tx.hash && <WaitPanel guide={guide} />}
        <TxStage tx={tx} sign={signGuide(tx.call?.fn ?? "bid")} sending={sendingGuide(tx.call?.fn ?? "bid")} label={lastLabel || "Your transaction"} judged={!!tx.call && isJudged(tx.call.fn)} />
        {tx.sending && <p className="sr-only">Waiting for the wallet.</p>}
        <DemoStage call={clerk} />
        {(tx.final || clerk.tx.final) && <WaitPanel guide={guide} />}

        {!me && !isMock && (
          <div className="sheet-plain px-4 py-3 text-[14px]">
            Connect a wallet to bid, reveal, assess or award. Studio&apos;s test GEN is free from the wallet menu.
            <div className="mt-2">
              <Button size="sm" onClick={() => void wallet.connect()}>
                Connect a wallet
              </Button>
            </div>
          </div>
        )}

        {me && t.status === "open" && now < t.bidBy && !mine && !iAmBuyer && <BidForm t={t} me={me} demo={isDemo} busy={busy} send={act} />}
        {mine && t.status === "open" && mine.status === "committed" && <MySlip t={t} b={mine} me={me} />}

        {me && t.awardReady && t.status === "open" && (
          <div className="sheet-plain px-4 py-3">
            <p className="text-[14px]">Every window has closed. The rule picks the winner; anyone may send it.</p>
            <Button className="mt-2" disabled={busy} onClick={() => act(calls.award(t.id), `award() of ${t.id}`)}>
              Award {t.id}
            </Button>
          </div>
        )}
        {t.status === "awarded" && (iAmBuyer || winnerMe) && (
          <div className="sheet-plain flex flex-wrap gap-2 px-4 py-3">
            {iAmBuyer && (
              <>
                <Button variant="ok" disabled={busy} onClick={() => act(calls.complete(t.id), `complete() of ${t.id}: ${gen(t.priceAtto)} to the winner`)}>
                  Release {gen(t.priceAtto)} to the winner
                </Button>
                {!t.disputedAt && now < t.completeBy + 2 * 86400 && (
                  <Button variant="plain" disabled={busy} onClick={() => act(calls.dispute(t.id), `dispute() of ${t.id}`)}>
                    Dispute (holds the claim 30 days)
                  </Button>
                )}
              </>
            )}
            {winnerMe && (
              <>
                <Button variant="ok" disabled={busy || now < t.claimableAt} onClick={() => act(calls.claimPayment(t.id), `claim_payment() of ${t.id}`)}>
                  {now < t.claimableAt ? `Claim opens ${when(t.claimableAt)}` : `Claim ${gen(t.priceAtto)}`}
                </Button>
                <Button variant="plain" disabled={busy} onClick={() => act(calls.waive(t.id), `waive() of ${t.id}`)}>
                  Waive it back to the buyer
                </Button>
              </>
            )}
          </div>
        )}

        {isDemo && (
          <section className="sheet pinned px-4 pt-6 pb-4" aria-labelledby="clerk-title">
            <h2 id="clerk-title" className="head text-[20px] font-bold">
              The demo clerk
            </h2>
            <p className="mt-1 text-[13.5px] text-ink-2">
              You bid alone, so the site plays the others: the school that issued the notice, {RIVALS[0].name} ({RIVALS[0].note}) and {RIVALS[1].name} ({RIVALS[1].note}). It never appeals or challenges: a second look is yours to choose.
            </p>
            {!d?.online && <p className="mt-2 text-[13.5px] text-amber">The demo clerk is offline: {d?.reason || "its status could not be read"}.</p>}
            {d?.online && (
              <div className="mt-2 flex flex-wrap gap-2">
                {moves.map((m) => (
                  <Button key={m.label} size="sm" variant={m.move === "bid" || m.move === "reveal" ? "primary" : "plain"} disabled={busy} onClick={() => void clerk.ask(m.move, { tender: t.id, bid: m.bid, rival: m.rival }, m.label)}>
                    {m.label}
                  </Button>
                ))}
                {moves.length === 0 && <p className="text-[13.5px] text-ink-2">Nothing for the clerk to do right now.</p>}
              </div>
            )}
            {d?.online && freshOk && (
              <div className="mt-3 border-t border-dotted border-rule pt-2">
                {d.tender && d.tender !== t.id ? (
                  <Link href={tenderPath(d.tender)} className="link text-council">
                    A newer demo tender is up: {d.tender}
                  </Link>
                ) : (
                  <>
                    <p className="text-[13.5px] text-ink-2">This tender has stopped taking bids. Ask for a fresh one to bid on.</p>
                    <Button size="sm" className="mt-1.5" disabled={busy} onClick={() => void clerk.ask("open", {}, "Open a fresh demo tender").then(() => demo.retry())}>
                      Open a fresh demo tender
                    </Button>
                  </>
                )}
              </div>
            )}
          </section>
        )}
      </aside>
      <div className="min-w-0 lg:col-start-1">
        <BidBoard t={t} bids={bids} now={now} nameOf={nameOf} actionsFor={actionsFor} />
      </div>
    </div>
  );
}

function RevealButton({ t, b, me, busy, send }: { t: Tender; b: Bid; me: string; busy: boolean; send: (call: Call, label: string) => void }) {
  const raw = useLocal(() => slipRaw(t.id, me), "");
  const slip = parseSlip(raw);
  const [paste, setPaste] = React.useState("");
  const [bad, setBad] = React.useState("");
  if (slip && slip.commitment === b.commitment)
    return (
      <Button size="sm" disabled={busy} onClick={() => send(calls.reveal(b.id, slip.priceAtto, slip.proposal, slip.salt), `reveal() of ${b.id} at ${gen(slip.priceAtto)}`)}>
        Reveal {b.id} · {gen(slip.priceAtto)}
      </Button>
    );
  const use = () => {
    const s = parseSlip(paste);
    if (!s) return setBad("That is not a whole reveal slip.");
    if (s.commitment !== b.commitment) return setBad("That slip is for another bid: its commitment does not match.");
    saveSlip({ ...s, tender: t.id, bidder: me, bid: b.id });
    setBad("");
  };
  return (
    <div className="w-full">
      <p className="text-[13.5px] text-no">This browser holds no reveal slip for {b.id}. Paste the slip you saved, or open the file and copy its text.</p>
      <textarea className="field mono mt-1 min-h-16 text-[12px]" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder='{"tender": "T1", "priceAtto": "...", ...}' />
      <Button size="sm" className="mt-1" onClick={use}>
        Use this slip
      </Button>
      {bad && <p className="mt-1 text-[13px] text-no">{bad}</p>}
    </div>
  );
}

function MySlip({ t, b, me }: { t: Tender; b: Bid; me: string }) {
  const raw = useLocal(() => slipRaw(t.id, me), "");
  const slip = parseSlip(raw);
  return (
    <div className="sheet-plain px-4 py-3 text-[14px]">
      <p className="head text-[16px] font-bold">Your reveal slip for {b.id}</p>
      {slip && slip.commitment === b.commitment ? (
        <>
          <p className="mt-1 text-ink-2">
            Kept in this browser: {gen(slip.priceAtto)}, salt <span className="mono">{slip.salt.slice(0, 8)}…</span>. Keep a copy too, in case this browser forgets it.
          </p>
          <div className="mt-2">
            <SlipActions slip={slip} />
          </div>
        </>
      ) : (
        <p className="mt-1 text-no">This browser holds no slip for this bid. If you saved one, you can paste it when you reveal.</p>
      )}
    </div>
  );
}
