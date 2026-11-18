// The marks as data URIs, for the generated app icon and share card: the wax-sealed envelope pinned to
// cork, and the colours of the noticeboard.

export const CORK = "#B98A57";
export const CORK_DARK = "#8A6136";
export const PAPER = "#FBF7EC";
export const INK = "#1E2430";
export const COUNCIL = "#22406E";
export const WAX = "#9E1F24";
export const MEETS = "#2F6B3A";
export const MISSES = "#B4231C";
export const BRASS = "#C9A43A";

/** The app icon: a cream envelope, its flap sealed with red wax, pinned by a brass pin to a square of cork. */
export function markSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="${CORK}"/><g fill="${CORK_DARK}" opacity=".55"><circle cx="9" cy="12" r="1.3"/><circle cx="52" cy="9" r="1.1"/><circle cx="57" cy="40" r="1.4"/><circle cx="7" cy="47" r="1.2"/><circle cx="30" cy="58" r="1.1"/><circle cx="46" cy="55" r="1.3"/><circle cx="16" cy="30" r=".9"/></g><g transform="rotate(-6 32 34)"><rect x="10" y="20" width="44" height="30" rx="2" fill="${PAPER}" stroke="${INK}" stroke-width="2"/><path d="M10.5 21 32 37 53.5 21" fill="none" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/><circle cx="32" cy="37" r="7" fill="${WAX}"/><circle cx="32" cy="37" r="4.3" fill="none" stroke="#6E1216" stroke-width="1.4"/><path d="M30 35.5h4M32 35.5v4" stroke="#6E1216" stroke-width="1.3" stroke-linecap="round"/></g><circle cx="31" cy="17" r="5" fill="${BRASS}" stroke="#7A6116" stroke-width="1.5"/><circle cx="29.6" cy="15.6" r="1.5" fill="#F3E3A6"/></svg>`;
}

export const markDataUri = (): string => `data:image/svg+xml;base64,${Buffer.from(markSvg()).toString("base64")}`;
