// One requirement's mark on the tabulation sheet, as a pencil would make it: a green tick for MEETS, a red
// cross for MISSES, an amber query for UNCLEAR, a dot while unjudged.

import { cx } from "@/lib/cx";
import type { Token } from "@/lib/types";

export function Pencil({ mark, k }: { mark: Token | ""; k: number }) {
  const word = mark || "not judged yet";
  return (
    <span title={`Requirement ${k}: ${word}`} aria-label={`Requirement ${k}: ${word}`} className={cx("pencil", mark === "MEETS" && "pencil-meets", mark === "MISSES" && "pencil-misses", mark === "UNCLEAR" && "pencil-unclear", !mark && "text-ink-3")}>
      {mark === "MEETS" ? (
        <svg width="22" height="20" viewBox="0 0 22 20" aria-hidden>
          <path d="M2.5 11.5c2 1.2 3.6 3.2 5 5.6C10 11 14 5.5 20 2" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : mark === "MISSES" ? (
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
          <path d="M3 3.5c4.5 4 9 8.6 14 13.2M16.5 3c-4 4.4-8.6 9-13.5 14" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
        </svg>
      ) : mark === "UNCLEAR" ? (
        "?"
      ) : (
        "·"
      )}
    </span>
  );
}
