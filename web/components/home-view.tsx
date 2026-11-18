"use client";

// The noticeboard's front: the problem, pinned as a printed circular, and the live demo tender below it,
// whole, with the clerk's desk. When the demo school has no tender up, a button asks for one.

import Link from "next/link";

import { Button } from "@/components/button";
import { DemoStage, useDemoCall } from "@/components/demo-call";
import { TenderView } from "@/components/tender-view";
import { useDemoStatus } from "@/components/use-demo";
import { WaitPanel } from "@/components/wait-panel";
import { demoGuide } from "@/lib/guide";

export function HomeView() {
  const demo = useDemoStatus();
  const clerk = useDemoCall(() => demo.retry());
  const d = demo.data;
  return (
    <div className="flex flex-col gap-8">
      <section className="grid gap-6 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="sheet pinned tilt-l px-5 pt-7 pb-6 sm:px-8">
          <p className="smallcaps text-[13px] text-wax">Circular to all small public buyers</p>
          <h1 className="head mt-2 text-[28px] leading-[1.12] font-bold sm:text-[34px]">The cheapest bid that meets every requirement wins. The buyer does not decide which bids those are.</h1>
          <p className="mt-4 text-[16px]">
            A primary school must give its repainting to the cheapest bid that meets every requirement. The school also reads the bids. A head teacher who wants a friend to win can call the cheaper bid non-compliant (&ldquo;they never really promised low-VOC paint&rdquo;), and nobody outside can check.
          </p>
          <p className="mt-3 text-[16px]">
            Here the bids are sealed until bidding closes. Then GenLayer&apos;s validators read each proposal against the published requirements, one question per requirement, in two orders, and the award follows a fixed rule. Each side gets one bonded second look: the bidder may appeal, the buyer or a rival may challenge.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/how" className="btn btn-plain">
              <span>How it works, word for word</span>
            </Link>
            <Link href="/open" className="btn btn-plain">
              <span>Open your own tender</span>
            </Link>
          </div>
        </div>
        <ol className="sheet pinned tilt-r flex flex-col self-start gap-3 px-5 pt-7 pb-5 text-[15px]">
          <li>
            <span className="smallcaps font-bold text-wax">1 · Seal.</span> You bid alone, with a price and a proposal. The site seals them in your browser and keeps your reveal slip.
          </li>
          <li>
            <span className="smallcaps font-bold text-wax">2 · Reveal.</span> When bidding closes, every envelope is opened: yours with your slip, the two rivals&apos; on a button.
          </li>
          <li>
            <span className="smallcaps font-bold text-wax">3 · Assess.</span> Anyone presses Assess on a bid. The network marks each requirement: green tick, red cross, or a query.
          </li>
          <li>
            <span className="smallcaps font-bold text-wax">4 · Second look.</span> Twenty minutes to appeal a red cross, or to challenge a bid that reads all ticks.
          </li>
          <li>
            <span className="smallcaps font-bold text-wax">5 · Award.</span> The cheapest all-tick bid wins; the rest of the budget goes back to the school.
          </li>
        </ol>
      </section>

      <section aria-labelledby="live-title" className="flex flex-col gap-4">
        <h2 id="live-title" className="head inline-block self-start bg-card-2 px-3 py-1 text-[24px] font-bold shadow">
          On the board now: the demo tender
        </h2>
        {demo.loading && !d && <p className="sheet-plain px-4 py-3 text-sm">Asking the demo clerk which tender is up…</p>}
        {d && !d.online && (
          <p className="sheet-plain px-4 py-3 text-[14px]">
            The demo clerk is offline: {d.reason}. You can still <Link href="/open" className="link text-council">open a tender</Link> and bid on it from a second wallet.
          </p>
        )}
        {d?.online && d.tender && <TenderView id={d.tender} compact />}
        {d?.online && !d.tender && (
          <div className="flex flex-col gap-3">
            {!clerk.asking && !clerk.tx.hash && (
              <WaitPanel
                guide={{ ...demoGuide("open"), id: "none", tone: "act", kicker: "No demo tender yet", now: "The demo school has no notice up yet.", time: "About two minutes once asked.", need: "Ask for one.", mustAct: false }}
                action={<Button onClick={() => void clerk.ask("open", {}, "Open a fresh demo tender")}>Open the demo tender</Button>}
              />
            )}
            <DemoStage call={clerk} />
          </div>
        )}
      </section>
    </div>
  );
}
