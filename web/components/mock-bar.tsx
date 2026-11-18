"use client";

// Mock mode only. No wallet and no chain: the visitor acts as one of two people on the in-memory contract.
// This bar says so on every page, lets them change account, gives test GEN, and moves the clock on so a
// window can be seen closing.

import { useLocal } from "@/components/use-local";
import { PERSONAS, advanceClock, mockAddress, mockBalanceText, mockClockOffset, setMockPersona } from "@/lib/chain-mock";
import { faucet } from "@/lib/chain";
import { gen, span } from "@/lib/format";

const small = "smallcaps h-8 border border-ink bg-card-2 px-2 text-[13px] font-bold hover:bg-card active:translate-y-px";

export function MockBar() {
  const address = useLocal(mockAddress, PERSONAS[0].address);
  const balance = useLocal(() => mockBalanceText(mockAddress()), "0");
  const offset = useLocal(mockClockOffset, 0);
  return (
    <div className="border-b-2 border-ink bg-[repeating-linear-gradient(135deg,#c9a43a_0_12px,#1e2430_12px_24px)] p-1">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-2 bg-card-2 px-3 py-2 text-xs lg:flex-row lg:items-center lg:justify-between">
        <p className="min-w-0">
          <strong className="smallcaps font-bold">Mock build.</strong> An in-memory copy of the contract; no model is asked. A proposal meets a requirement when it holds the requirement&apos;s words. On chain every validator asks its own model, in both orders. A reload starts again.
        </p>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <label htmlFor="mock-persona" className="smallcaps shrink-0 font-bold">
            Acting as
          </label>
          <select id="mock-persona" value={address} onChange={(e) => setMockPersona(e.target.value)} className="h-8 max-w-full min-w-0 border border-ink bg-card-2 px-1 text-xs">
            {PERSONAS.map((p) => (
              <option key={p.address} value={p.address}>
                {p.name}: {p.note}
              </option>
            ))}
          </select>
          <span className="mono whitespace-nowrap">{gen(balance)}</span>
          <button type="button" onClick={() => void faucet(address)} className={small}>
            +10 GEN
          </button>
          <button type="button" onClick={() => advanceClock(300)} className={small}>
            Clock +5 min
          </button>
          <button type="button" onClick={() => advanceClock(1200)} className={small}>
            +20 min
          </button>
          {offset > 0 && <span className="text-ink-2">clock moved on {span(offset)}</span>}
        </div>
      </div>
    </div>
  );
}
