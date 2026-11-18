"use client";

// Asking the demo clerk to make one move, and following what it signed: while the site's server asks, a
// short wait; if the clerk says no, its reason in a sentence; once it signed, the clerk's waiting panel over
// the docket slip of its transaction.

import * as React from "react";

import { TxRail } from "@/components/tx-rail";
import { useTx, type TxRun } from "@/components/use-tx";
import { WaitPanel } from "@/components/wait-panel";
import { askDemo } from "@/lib/chain";
import { demoGuide } from "@/lib/guide";
import type { Call, DemoMove, TxStatus } from "@/lib/types";

export type DemoTarget = { tender?: string; bid?: string; rival?: string };
export type DemoCall = { tx: TxRun; asking: boolean; reason: string; note: string; move: DemoMove | null; label: string; ask: (move: DemoMove, target: DemoTarget, label: string) => Promise<boolean>; clear: () => void };

const CALL_OF: Record<DemoMove, Call["fn"]> = { open: "open_tender", bid: "bid", reveal: "reveal", assess: "assess", place: "place", award: "award", complete: "complete", reclaim: "reclaim" };

export function useDemoCall(onFinal?: (s: TxStatus, hash: string, call: Call) => void): DemoCall {
  const tx = useTx(onFinal);
  const [asking, setAsking] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [note, setNote] = React.useState("");
  const [move, setMove] = React.useState<DemoMove | null>(null);
  const [label, setLabel] = React.useState("");
  const { track, reset } = tx;
  const ask = React.useCallback(
    async (m: DemoMove, target: DemoTarget, l: string) => {
      reset();
      setMove(m);
      setLabel(l);
      setAsking(true);
      setReason("");
      setNote("");
      const answer = await askDemo(m, target);
      setAsking(false);
      if (answer.ok) {
        setNote(answer.note ?? "");
        track(answer.hash, { fn: CALL_OF[m], args: [] });
        return true;
      }
      setReason(answer.reason);
      return false;
    },
    [track, reset],
  );
  const clear = React.useCallback(() => {
    reset();
    setReason("");
    setNote("");
    setMove(null);
  }, [reset]);
  return { tx, asking, reason, note, move, label, ask, clear };
}

export function DemoStage({ call, hideFinal }: { call: DemoCall; hideFinal?: boolean }) {
  if (call.asking) return <WaitPanel guide={demoGuide(call.move ?? "asking")} />;
  if (call.reason)
    return (
      <p role="alert" className="sheet-plain border-l-4 !border-l-amber px-3 py-2 text-sm text-ink">
        The demo clerk did not act: {call.reason}
      </p>
    );
  if (!call.tx.hash || !call.move) return null;
  if (call.tx.final && hideFinal) return null;
  return (
    <div className="flex flex-col gap-2.5">
      {!call.tx.final && <WaitPanel guide={demoGuide(call.move)} since={call.tx.at || undefined} />}
      {call.note && <p className="text-sm text-ink-2">{call.note}.</p>}
      <TxRail hash={call.tx.hash} label={`Demo clerk · ${call.label}`} judged={call.move === "assess"} onDone={call.tx.onDone} />
    </div>
  );
}
