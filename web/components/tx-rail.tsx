"use client";

// One transaction while it goes through, as a docket slip: the explorer link from the first second, the six
// stages (sent, propose, commit, reveal, accept, final) stamped as they are reached with the time each was
// first seen, and for an assessment, an appeal or a challenge the validators' votes. FINALIZED does not mean
// the state changed: a round whose validators split finalizes too, with nothing stored. The slip reads the
// tally, not only the status, and says so.

import * as React from "react";

import { IconExternal } from "@/components/icons";
import { useWallet } from "@/components/wallet";
import { failureOf, invalidateReads, isMock, movesMoney, txStatus, txUrl } from "@/lib/chain";
import { cx } from "@/lib/cx";
import { STAGES } from "@/lib/rpc";
import type { TxStatus, Votes } from "@/lib/types";

const POLL_MS = isMock ? 500 : 3000;

export const isFinal = (s: TxStatus) => s.undetermined || s.status === "FINALIZED" || s.status === "CANCELED" || s.status === "UNDETERMINED";

/** Polls txStatus(hash) until it is final. The status is kept with its hash, so a new hash never shows an old result. */
export function useTxStatus(hash: string | null): TxStatus | null {
  const [latest, setLatest] = React.useState<{ hash: string; status: TxStatus } | null>(null);
  React.useEffect(() => {
    if (!hash) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const s = await txStatus(hash);
        if (stopped) return;
        setLatest({ hash, status: s });
        if (isFinal(s)) return;
      } catch {
        /* a dropped poll is not a failed transaction; the next one may answer */
      }
      if (!stopped) timer = setTimeout(tick, POLL_MS);
    };
    void tick();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [hash]);
  return latest && latest.hash === hash ? latest.status : null;
}

const STAGE_WORD: Record<string, string> = { PENDING: "Sent", PROPOSING: "Propose", COMMITTING: "Commit", REVEALING: "Reveal", ACCEPTED: "Accept", FINALIZED: "Final" };

const clockOf = (ms: number) => new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

/** Five (or more) validator boxes on the strip: agree, disagree, idle, or still waiting. */
export function VoteRow({ votes }: { votes: Votes }) {
  const total = votes.agree + votes.disagree + votes.idle;
  return (
    <div>
      <div className="flex gap-1" aria-label="Validator votes">
        {Array.from({ length: Math.max(5, total) }, (_, i) => {
          const kind = i < votes.agree ? "agree" : i < votes.agree + votes.disagree ? "disagree" : total ? "idle" : "waiting";
          return (
            <span
              key={i}
              title={kind}
              className={cx(
                "smallcaps h-7 min-w-0 flex-1 border text-center text-[12px] leading-[26px] font-bold",
                kind === "agree" && "border-ok bg-ok-wash text-ok",
                kind === "disagree" && "border-no bg-no-wash text-no",
                kind === "idle" && "border-rule bg-card text-ink-3",
                kind === "waiting" && "border-dashed border-rule text-ink-3",
              )}
            >
              {kind === "waiting" ? "" : kind}
            </span>
          );
        })}
      </div>
      <p className="mt-1 text-xs text-ink-3">{total === 0 ? "Waiting for the validators' votes…" : `${votes.agree} agree · ${votes.disagree} disagree · ${votes.idle} idle`}</p>
    </div>
  );
}

export function TxRail({ hash, label, judged, onDone, className }: { hash: string; label: string; judged?: boolean; onDone?: (status: TxStatus) => void; className?: string }) {
  const status = useTxStatus(hash);
  const wallet = useWallet();
  const doneFor = React.useRef<string | null>(null);
  const onDoneRef = React.useRef(onDone);
  const refreshRef = React.useRef(wallet.refreshBalance);
  const watchRef = React.useRef(wallet.watchBalance);
  const [seen, setSeen] = React.useState<{ hash: string; at: Record<string, number> }>({ hash, at: {} });
  React.useEffect(() => {
    onDoneRef.current = onDone;
    refreshRef.current = wallet.refreshBalance;
    watchRef.current = wallet.watchBalance;
  }, [onDone, wallet.refreshBalance, wallet.watchBalance]);

  const stageIndex = status ? STAGES.indexOf(status.status) : -1;
  const final = status ? isFinal(status) : false;
  const canceled = status?.status === "CANCELED";
  const split = !!status?.undetermined;

  // The time each stage was first seen, punched on the strip.
  React.useEffect(() => {
    const upto = final && !split && !canceled ? STAGES.length - 1 : stageIndex;
    if (upto < 0) return;
    // The first time each stage is seen is a fact about the outside world arriving, recorded once.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSeen((prev) => {
      const base = prev.hash === hash ? prev.at : {};
      const at = { ...base };
      let changed = prev.hash !== hash;
      for (let i = 0; i <= upto; i++)
        if (!at[STAGES[i]]) {
          at[STAGES[i]] = Date.now();
          changed = true;
        }
      return changed ? { hash, at } : prev;
    });
  }, [hash, stageIndex, final, split, canceled]);

  React.useEffect(() => {
    if (!status || !isFinal(status) || doneFor.current === hash) return;
    doneFor.current = hash;
    invalidateReads();
    if (movesMoney(status)) watchRef.current();
    else void refreshRef.current();
    onDoneRef.current?.(status);
  }, [status, hash]);

  const failure = status && final ? failureOf(status) : "";
  const ok = final && !failure;
  const at = seen.hash === hash ? seen.at : {};

  return (
    <div className={cx("sheet-plain border-l-4 !border-l-council px-3 py-3 text-sm", className)} data-tx={hash}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="head min-w-0 text-[15px] font-bold">{label}</p>
        <a href={txUrl(hash)} target="_blank" rel="noreferrer" className="mono link inline-flex items-center gap-1 text-xs break-all text-ink-2">
          {isMock ? "mock tx " : "explorer "}
          {hash.slice(0, 10)}…{hash.slice(-6)}
          <IconExternal size={12} />
        </a>
      </div>
      <ol className="mt-2 grid grid-cols-3 gap-x-2 gap-y-1 sm:grid-cols-6" aria-label="Consensus stages">
        {STAGES.map((stage, i) => {
          const reached = split ? i < 4 : final && !canceled ? true : i <= stageIndex;
          const current = !final && i === stageIndex;
          return (
            <li key={stage} aria-current={current ? "step" : undefined} className={cx("min-w-0 border-t-2 pt-0.5", reached ? (split || canceled ? "border-amber" : "border-council") : current ? "border-dashed border-council" : "border-rule")}>
              <span className={cx("smallcaps block text-[12.5px] font-bold", reached ? "text-ink" : "text-ink-3")}>{STAGE_WORD[stage]}</span>
              <span className={cx("mono block text-[11px] text-ink-2", !reached && "opacity-0")}>{at[stage] ? clockOf(at[stage]) : "--:--:--"}</span>
            </li>
          );
        })}
      </ol>
      {judged && (
        <div className="mt-2.5">
          <VoteRow votes={status?.votes ?? { agree: 0, disagree: 0, idle: 0 }} />
        </div>
      )}
      <div className="mt-2" role="status" aria-live="polite">
        {!status && <p className="text-ink-2">Sent. Waiting for the network to list it…</p>}
        {status && !final && (
          <p className="text-ink-2">
            {status.status === "UNKNOWN"
              ? "The network has not listed this transaction yet. It usually appears within a few seconds."
              : judged
                ? "Every validator reads the proposal against every requirement itself, asks its own model in both orders, and agrees only if its mask and fingerprint match the leader's exactly."
                : "The validators are checking the call; no model runs for it. Usually under a minute."}
          </p>
        )}
        {split && !canceled && (
          <p className="text-amber">
            <strong>Nothing was stored.</strong> {failure}
          </p>
        )}
        {canceled && <p className="text-no">The network cancelled this transaction. Nothing was stored.</p>}
        {final && !split && !canceled && failure && (
          <p className="text-no">
            <strong>Final, and refused:</strong> {failure}
            {status?.result && "returned" in status.result ? " Everything sent came back in the same transaction." : ""}
          </p>
        )}
        {ok && !split && (
          <p className="text-ok">
            <strong>Final.</strong> The validators agreed and the result is stored.
            {status && movesMoney(status) ? " Money moved by this call lands in wallets a few seconds after it is final." : ""}
          </p>
        )}
      </div>
    </div>
  );
}
