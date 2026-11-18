// Line icons drawn for this site: the pin, the quill, the clock, the hand, and a few small ones.

type P = { size?: number; className?: string };
const base = (size: number) => ({ width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true });

export function IconQuill({ size = 20, className }: P) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M20 4c-6 1-11 6-13 13l-2 3" />
      <path d="M20 4c0 6-4 11-11 12" />
      <path d="M9 12h5" />
    </svg>
  );
}
export function IconClock({ size = 16, className }: P) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
export function IconCheck({ size = 16, className }: P) {
  return (
    <svg {...base(size)} className={className}>
      <path d="m5 12 5 5 9-10" />
    </svg>
  );
}
export function IconHand({ size = 16, className }: P) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12" />
      <path d="M11 11V4.5a1.5 1.5 0 0 1 3 0V11" />
      <path d="M14 11V6.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-2.7L3 14.5a1.5 1.5 0 0 1 2.4-1.8L8 15" />
    </svg>
  );
}
export function IconExternal({ size = 14, className }: P) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M14 4h6v6" />
      <path d="M20 4 10 14" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </svg>
  );
}
export function IconWallet({ size = 16, className }: P) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18" />
      <circle cx="16.5" cy="14.5" r="1" />
    </svg>
  );
}
export function IconDrop({ size = 16, className }: P) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" />
    </svg>
  );
}
export function IconCopy({ size = 15, className }: P) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="8" y="8" width="12" height="12" rx="1" />
      <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
    </svg>
  );
}
export function IconDownload({ size = 15, className }: P) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 4v11" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 20h14" />
    </svg>
  );
}
