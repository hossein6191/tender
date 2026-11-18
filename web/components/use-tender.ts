"use client";

// One tender and all its bids, read together, kept fresh: again whenever the chain moves under the page,
// again when a deadline of the tender passes on the clock, and every thirty seconds while it is open.

import * as React from "react";

import { useNow } from "@/components/use-now";
import { useAfterTx, useRead } from "@/components/use-read";
import { readBids, readTender } from "@/lib/chain";
import type { Bid, Tender } from "@/lib/types";

export type TenderData = { tender: Tender | null; bids: Bid[]; partial: boolean };

export function useTender(id: string) {
  const state = useRead<TenderData>(async () => {
    const t = (await readTender(id)).data;
    if (!t) return { data: { tender: null, bids: [], partial: false }, source: "chain" };
    const b = (await readBids(id)).data;
    return { data: { tender: t, bids: b.rows, partial: b.partial }, source: "chain" };
  }, [id]);
  const { refresh } = state;
  useAfterTx(refresh);
  const now = useNow();
  const t = state.data?.tender;
  const marks = t ? [t.bidBy, t.revealBy, t.reviewBy, t.appealUntil, ...(state.data?.bids ?? []).map((b) => b.appealUntil)] : [];
  const passed = marks.filter((m) => m > 0 && now >= m).length;
  const last = React.useRef(passed);
  React.useEffect(() => {
    if (passed !== last.current) {
      last.current = passed;
      void refresh();
    }
  }, [passed, refresh]);
  const open = t?.status === "open" || t?.status === "awarded";
  React.useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => void refresh(), 30_000);
    return () => clearInterval(timer);
  }, [open, refresh]);
  return state;
}
