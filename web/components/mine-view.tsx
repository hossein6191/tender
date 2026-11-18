"use client";

// My bids: every tender the connected address opened or bid on, the reveal slips this browser keeps, and the
// credit held for bonds, with a button to take it back.

import Link from "next/link";

import { Button } from "@/components/button";
import { ReadProblem } from "@/components/read-state";
import { TxStage } from "@/components/tx-stage";
import { useLocal } from "@/components/use-local";
import { useMe } from "@/components/use-me";
import { useAfterTx, useRead } from "@/components/use-read";
import { useTx } from "@/components/use-tx";
import { useWallet } from "@/components/wallet";
import { calls } from "@/lib/calls";
import { readCredit, readTendersOfWindow, tenderPath } from "@/lib/chain";
import { big, gen, short } from "@/lib/format";
import { sendingGuide, signGuide } from "@/lib/guide";
import { parseSlip, slipIndexRaw, slipRaw } from "@/lib/slips";

const STATUS: Record<string, string> = { open: "open", awarded: "awarded", paid: "paid", waived: "waived", no_award: "no award" };

export function MineView() {
  const me = useMe();
  const wallet = useWallet();
  const rows = useRead(() => readTendersOfWindow(me), [me], { enabled: !!me });
  const credit = useRead(() => readCredit(me), [me], { enabled: !!me });
  useAfterTx(rows.refresh);
  useAfterTx(credit.refresh);
  const tx = useTx();
  const index = useLocal(slipIndexRaw, "");
  const slips = (() => {
    try {
      return (JSON.parse(index || "[]") as string[]).map((k) => parseSlip(slipRaw(k.split(":")[0], k.split(":")[1] ?? ""))).filter((s) => s && s.bidder === me);
    } catch {
      return [];
    }
  })();

  if (!me)
    return (
      <div className="sheet pinned px-5 pt-7 pb-5">
        <h1 className="head text-[28px] font-bold">My bids</h1>
        <p className="mt-2">Connect a wallet to see the tenders you opened or bid on.</p>
        <Button className="mt-3" onClick={() => void wallet.connect()}>
          Connect a wallet
        </Button>
      </div>
    );
  const c = credit.data ?? "0";
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start">
      <section className="sheet pinned tilt-l px-4 pt-7 pb-5 sm:px-6">
        <h1 className="head text-[28px] font-bold">My bids and tenders</h1>
        <p className="mono text-[13px] text-ink-2">{short(me)}</p>
        <div className="mt-3">
          <ReadProblem state={rows} what="your tenders" />
        </div>
        {rows.data && rows.data.rows.length === 0 && <p className="mt-3 text-ink-2">Nothing yet. Bid on the demo tender from the noticeboard.</p>}
        <ul className="ruled mt-3">
          {rows.data?.rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-ruled/70 py-1.5">
              <Link href={tenderPath(r.id)} className="link min-w-0">
                <span className="mono font-bold">{r.id}</span> {r.title}
              </Link>
              <span className="smallcaps text-[13px] text-ink-2">
                {r.role === "buyer" ? "you are the buyer" : `your bid ${r.bid}`} · {STATUS[r.status]}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <aside className="flex min-w-0 flex-col gap-4">
        <section className="sheet pinned px-4 pt-6 pb-4">
          <h2 className="head text-[20px] font-bold">Credit held for bonds</h2>
          <p className="mono mt-1 text-[24px] font-bold">{gen(c)}</p>
          <p className="text-[13.5px] text-ink-2">Bonds that come back land here: an over-budget reveal, a reclaimed bid bond, a challenge you won. Appeal and challenge bonds are taken from it.</p>
          {big(c) > 0n && (
            <Button className="mt-2" variant="ok" disabled={tx.sending || (!!tx.hash && !tx.final)} onClick={() => void tx.start(calls.withdraw(big(c)))}>
              Withdraw {gen(c)} to my wallet
            </Button>
          )}
        </section>
        <TxStage tx={tx} sign={signGuide("withdraw")} sending={sendingGuide("withdraw")} label="withdraw()" />
        <section className="sheet-plain px-4 py-3">
          <h2 className="head text-[18px] font-bold">Reveal slips in this browser</h2>
          {slips.length === 0 && <p className="mt-1 text-[14px] text-ink-2">None. A slip is saved here the moment you seal a bid.</p>}
          <ul className="mt-1 text-[14px]">
            {slips.map((s) => (
              <li key={s!.tender} className="border-t border-dotted border-rule py-1">
                <Link href={tenderPath(s!.tender)} className="link">
                  {s!.tender}
                  {s!.bid ? ` · ${s!.bid}` : ""}
                </Link>{" "}
                <span className="mono">{gen(s!.priceAtto)}</span>
              </li>
            ))}
          </ul>
        </section>
      </aside>
    </div>
  );
}
