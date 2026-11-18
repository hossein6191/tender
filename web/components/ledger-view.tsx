"use client";

// The register: the contract's own totals (what it holds, what it paid, what went back) and every tender
// pinned to it, newest first.

import Link from "next/link";

import { ReadProblem } from "@/components/read-state";
import { useAfterTx, useRead } from "@/components/use-read";
import { readStats, readTendersWindow, tenderPath } from "@/lib/chain";
import { gen, short, when } from "@/lib/format";

export function LedgerView() {
  const stats = useRead(() => readStats(), ["stats"]);
  const list = useRead(() => readTendersWindow(), ["tenders"]);
  useAfterTx(stats.refresh);
  useAfterTx(list.refresh);
  const s = stats.data;
  const figures: [string, string][] = s
    ? [
        ["Tenders", String(s.tenders)],
        ["Bids", String(s.bids)],
        ["Assessed", String(s.assessed)],
        ["Appeals (overturned)", `${s.appeals} (${s.overturned})`],
        ["Challenges (knocked out)", `${s.challenges} (${s.knockedOut})`],
        ["Awarded · no award", `${s.awarded} · ${s.noAward}`],
        ["Paid · waived", `${s.paid} · ${s.waived}`],
        ["Refused and refunded", String(s.refunds)],
      ]
    : [];
  const money: [string, string][] = s
    ? [
        ["Budgets held in escrow", gen(s.budgetsHeldAtto)],
        ["Bid bonds held", gen(s.bondsHeldAtto)],
        ["Credit held for bidders", gen(s.creditsHeldAtto)],
        ["Owed in all", gen(s.balanceOwedAtto)],
        ["Paid to winners", gen(s.paidTotalAtto)],
        ["Returned to buyers", gen(s.returnedTotalAtto)],
        ["Bonds to buyers", gen(s.toBuyersTotalAtto)],
      ]
    : [];
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:items-start">
      <section className="sheet pinned tilt-l px-4 pt-7 pb-5 sm:px-6">
        <h1 className="head text-[28px] font-bold">The register</h1>
        <p className="text-[14px] text-ink-2">The contract&apos;s own books, read from stats().</p>
        <div className="mt-3">
          <ReadProblem state={stats} what="the register's totals" />
        </div>
        <dl className="ruled mt-2">
          {[...figures, ...money].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-b border-ruled/70 py-1">
              <dt>{k}</dt>
              <dd className="mono font-bold">{v}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="sheet pinned tilt-r px-4 pt-7 pb-5 sm:px-6">
        <h2 className="head text-[24px] font-bold">Every notice, newest first</h2>
        <div className="mt-2">
          <ReadProblem state={list} what="the tenders" />
        </div>
        {list.data && list.data.rows.length === 0 && <p className="mt-2 text-ink-2">No tender has been opened on this register yet.</p>}
        <ul className="ruled mt-2">
          {list.data?.rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-ruled/70 py-1.5">
              <Link href={tenderPath(r.id)} className="link min-w-0">
                <span className="mono font-bold">{r.id}</span> {r.title}
              </Link>
              <span className="text-[13px] text-ink-2">
                <span className="mono">{gen(r.budgetAtto)}</span> · {r.bids} bids · {r.status.replace("_", " ")} · by {short(r.buyer)} · bids closed {when(r.bidBy)}
              </span>
            </li>
          ))}
        </ul>
        {list.data?.partial && <p className="mt-2 text-[13px] text-ink-3">Showing the newest sixty.</p>}
      </section>
    </div>
  );
}
