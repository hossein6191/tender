// A bid envelope: sealed with red wax while the bid is committed; once revealed the flap lifts and the
// seal breaks in two. A forfeited envelope is greyed and stays shut.

import { cx } from "@/lib/cx";

export function Envelope({ open, dim, size = 46, label }: { open: boolean; dim?: boolean; size?: number; label: string }) {
  return (
    <svg width={size} height={(size * 34) / 46} viewBox="0 0 46 34" role="img" aria-label={label} className={cx("shrink-0", open && "broken", dim && "opacity-45 grayscale")}>
      <rect x="1.5" y="5.5" width="43" height="27" rx="1.5" fill="#F3ECD9" stroke="#1E2430" strokeWidth="1.4" />
      {open ? <path d="M2 6 23 0.8 44 6" fill="#E9DFC3" stroke="#1E2430" strokeWidth="1.3" strokeLinejoin="round" /> : <path d="M2 6.2 23 20 44 6.2" fill="none" stroke="#1E2430" strokeWidth="1.3" strokeLinejoin="round" />}
      <path d="M2 32 18 18M44 32 28 18" stroke="#1E2430" strokeWidth="0.8" opacity="0.45" />
      <g>
        <path className="seal-l" d="M23 14.2a6 6 0 0 0 0 12l1.2-3-1.6-2.6 1.4-3.2z" fill="#9E1F24" stroke="#6E1216" strokeWidth="0.8" />
        <path className="seal-r" d="M23 14.2a6 6 0 0 1 0 12l1.2-3-1.6-2.6 1.4-3.2z" fill="#9E1F24" stroke="#6E1216" strokeWidth="0.8" />
        {!open && <circle cx="23" cy="20.2" r="3.4" fill="none" stroke="#6E1216" strokeWidth="0.9" />}
      </g>
    </svg>
  );
}
