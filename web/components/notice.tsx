// The printed notice of tender: the office's letterhead line, the title, the scope, the numbered
// requirements, the budget and the bond in typewriter figures, and the four deadlines as a ruled timetable.

import { Stamp } from "@/components/stamp";
import { cx } from "@/lib/cx";
import { gen, short, when } from "@/lib/format";
import type { Tender } from "@/lib/types";

const PHASE_WORD: Record<Tender["phase"], string> = {
  bidding: "Taking sealed bids",
  revealing: "Envelopes opening",
  reviewing: "Under review",
  ready_to_award: "Ready to award",
  awarded: "Awarded",
  paid: "Paid",
  waived: "Waived",
  no_award: "No award",
};

export function Notice({ t, buyerName, now, compact }: { t: Tender; buyerName: string; now: number; compact?: boolean }) {
  const rows: [string, number, string][] = [
    ["Sealed bids close", t.bidBy, "bid()"],
    ["Reveals close", t.revealBy, "reveal()"],
    ["Review closes", t.reviewBy, "assess()"],
    ["Work due", t.completeBy, "complete()"],
  ];
  return (
    <article className="sheet pinned tilt-l px-4 pt-6 pb-5 sm:px-7">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-ink pb-1.5">
        <p className="smallcaps text-[13px] text-ink-2">Notice of tender · {t.id}</p>
        <p className="smallcaps text-[13px] font-bold text-wax">{PHASE_WORD[t.phase]}</p>
      </div>
      <h1 className={cx("head mt-3 leading-tight font-bold", compact ? "text-[26px]" : "text-[30px] sm:text-[36px]")}>{t.title}</h1>
      <p className="mt-1 text-[14px] text-ink-2">
        Issued by <span className="font-semibold text-ink">{buyerName}</span> <span className="mono text-[12.5px]">{short(t.buyer)}</span> · {when(t.openedAt)}
      </p>
      <p className="mt-3 text-[15.5px]">{t.scope}</p>
      <h2 className="smallcaps mt-4 text-[15px] font-bold">Every bid must meet these requirements</h2>
      <ol className="mt-1.5 space-y-1">
        {t.requirements.map((r, i) => (
          <li key={i} className="flex gap-3 border-b border-dotted border-rule pb-1">
            <span className="mono w-6 shrink-0 text-right font-bold">{i + 1}.</span>
            <span className="min-w-0">{r}</span>
          </li>
        ))}
      </ol>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
        <div>
          <dt className="form-label">Maximum budget, in escrow</dt>
          <dd className="mono text-[20px] font-bold">{gen(t.budgetAtto)}</dd>
        </div>
        <div>
          <dt className="form-label">Bid bond</dt>
          <dd className="mono text-[20px] font-bold">{gen(t.bidBondAtto)}</dd>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <dt className="form-label">Award rule</dt>
          <dd className="text-[14px]">The cheapest bid that meets every requirement.</dd>
        </div>
      </dl>
      {!compact && (
        <table className="mt-4 w-full text-[14px]">
          <tbody>
            {rows.map(([label, at, fn]) => (
              <tr key={label} className={cx("border-t border-rule", now >= at && "text-ink-3")}>
                <th scope="row" className="py-1 pr-2 text-left font-normal">
                  {label} <span className="mono hidden text-[12px] text-ink-3 sm:inline">{fn}</span>
                </th>
                <td className="mono py-1 text-right">{when(at)}</td>
                <td className="w-16 py-1 text-right">{now >= at ? <span className="smallcaps text-[12px]">passed</span> : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {t.status === "awarded" || t.status === "paid" ? (
        <div className="pointer-events-none absolute top-16 right-4 sm:right-8">
          <Stamp tone="ok" size="lg">
            Awarded
          </Stamp>
        </div>
      ) : t.status === "no_award" ? (
        <div className="pointer-events-none absolute top-16 right-4 sm:right-8">
          <Stamp tone="no" size="lg">
            No award
          </Stamp>
        </div>
      ) : null}
    </article>
  );
}
