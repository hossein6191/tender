"use client";

// The three states every chain read has: loading, could not reach the network (with a retry), data.

import { Button } from "@/components/button";
import { NO_CONTRACT, RATE_LIMITED } from "@/lib/chain";
import type { ReadState } from "@/components/use-read";

export function ReadProblem({ state, what }: { state: ReadState<unknown>; what: string }) {
  if (state.loading && !state.data) return <p className="sheet-plain px-4 py-3 text-sm text-ink-2">Reading {what} from the register…</p>;
  if (!state.error) return null;
  const msg =
    state.error === NO_CONTRACT
      ? "The Tender register is not deployed yet, so there is nothing to read. The site runs in full in mock mode."
      : state.error === RATE_LIMITED
        ? "Studio is rate-limiting this browser for a few seconds."
        : `Could not reach the network to read ${what}. This says nothing about the data itself.`;
  return (
    <div role="alert" className="sheet-plain flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
      <span>{msg}</span>
      {state.error !== NO_CONTRACT && (
        <Button size="sm" variant="plain" onClick={state.retry}>
          Try again
        </Button>
      )}
    </div>
  );
}
