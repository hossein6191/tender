// The crest on the letterhead: a shield quartered by a ruled cross, a sealed envelope in the upper field
// and a balance below, under a mural crown.

export function Crest({ size = 44, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden className={className}>
      <path d="M12 9h24l-1.5-4h-4l-1 2.2h-3L25 5h-2l-1.5 2.2h-3L17.5 5h-4z" fill="#C9A43A" stroke="#1E2430" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M8 10h32v14c0 10-7.5 16-16 19C15.5 40 8 34 8 24z" fill="#FBF7EC" stroke="#1E2430" strokeWidth="2" />
      <path d="M24 10v33M8 24h32" stroke="#22406E" strokeWidth="1.6" />
      <rect x="11.5" y="14" width="9.5" height="7" fill="#FBF7EC" stroke="#1E2430" strokeWidth="1.2" />
      <path d="M11.8 14.3 16.2 18l4.5-3.7" fill="none" stroke="#1E2430" strokeWidth="1.1" />
      <circle cx="16.2" cy="18.3" r="1.8" fill="#9E1F24" />
      <path d="M28 18h9M32.5 14.5V21M29 18l-1.6 3.2h3.2zM36 18l-1.6 3.2h3.2z" fill="none" stroke="#1E2430" strokeWidth="1.1" strokeLinejoin="round" />
      <path d="M13 29l2.5 3 4-5M28.5 28l5 5M33.5 28l-5 5" fill="none" strokeWidth="1.8" strokeLinecap="round" stroke="#2F6B3A" />
      <path d="M28.5 28l5 5M33.5 28l-5 5" stroke="#B4231C" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
