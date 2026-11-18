"use client";

// One write, from the wallet prompt to the final line: while the wallet asks, the sign panel; while the
// transaction goes through, the page's waiting panel above the rail with its explorer link; once it is
// final, the rail's last line; and a wallet error in words a person can act on.

import * as React from "react";

import { TxRail } from "@/components/tx-rail";
import type { TxRun } from "@/components/use-tx";
import { WaitPanel } from "@/components/wait-panel";
import type { Guide } from "@/lib/guide";

export function TxStage({ tx, sign, sending, label, judged, hideFinal, className }: { tx: TxRun; sign: Guide; sending: Guide; label: string; judged?: boolean; hideFinal?: boolean; className?: string }) {
  if (tx.sending)
    return (
      <div className={className}>
        <WaitPanel guide={sign} />
      </div>
    );
  if (tx.error)
    return (
      <p role="alert" className={`border border-no bg-no-wash px-3 py-2 text-sm text-no ${className ?? ""}`}>
        {tx.error}
      </p>
    );
  if (!tx.hash) return null;
  if (tx.final && hideFinal) return null;
  return (
    <div className={`flex flex-col gap-2.5 ${className ?? ""}`}>
      {!tx.final && <WaitPanel guide={sending} since={tx.at || undefined} />}
      <TxRail hash={tx.hash} label={label} judged={judged} onDone={tx.onDone} />
    </div>
  );
}
