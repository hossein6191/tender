// The doors of contracts/tender.py, mirrored so a form can say what is wrong before anything is signed.
// The contract is always the one that decides; tests/unit/doors.test.mjs asks the contract's own
// _text_problem(), _requirements_of() and _is_salt() and checks these answer the same.

export const GEN = 10n ** 18n;
export const MIN_BUDGET = GEN / 10n;
export const MAX_BUDGET = 1000n * GEN;
export const MIN_BOND = GEN / 100n;
export const MAX_BOND = 10n * GEN;
export const SIZES = {
  title: [3, 80],
  scope: [20, 600],
  requirement: [5, 160],
  requirements: [1, 6],
  proposal: [40, 1200],
  reason: [20, 400],
  salt: [16, 64],
} as const;
export const MIN_BID_AHEAD = 600;
export const MIN_WINDOW = 600;
export const MAX_WINDOW = 7 * 86400;
export const APPEAL_SECONDS = 1200;
export const GRACE_SECONDS = 2 * 86400;
export const DISPUTE_HOLD = 30 * 86400;
export const PAGE = 20;
export const SEP = "|";

/** Python's str.strip() for the ASCII texts the contract takes: spaces and the ASCII whitespace controls. */
export const pyStrip = (s: string) => s.replace(/^[\s\x0b\x0c\x1c-\x1f]+|[\s\x0b\x0c\x1c-\x1f]+$/g, "");

/** "" when the text may be stored and judged, else why not, in the contract's words. */
export function textProblem(raw: unknown, least: number, most: number, what: string): string {
  if (typeof raw !== "string") return what + " must be text";
  if (raw.length > most) return `${what} is ${least} to ${most} characters; this one is ${raw.length}`;
  const text = pyStrip(raw);
  if (text.length < least) return `${what} is ${least} to ${most} characters; this one is ${text.length}`;
  for (const ch of raw) {
    const c = ch.codePointAt(0) ?? 0;
    if (c < 32 || c > 126) return `${what} is printable ASCII on one line`;
  }
  return "";
}

/** The requirements as one "|"-joined text: the trimmed list, or [] and why not. */
export function requirementsOf(raw: string): [string[], string] {
  if (raw.length > 6 * 161) return [[], "the requirements are at most 6 of at most 160 characters each, separated by |"];
  const parts = raw.split(SEP);
  if (parts.length < 1 || parts.length > 6) return [[], `a tender has 1 to 6 requirements, separated by |; this one has ${parts.length}`];
  const out: string[] = [];
  for (let k = 0; k < parts.length; k++) {
    const p = textProblem(parts[k], 5, 160, `requirement ${k + 1}`);
    if (p) return [[], p];
    out.push(pyStrip(parts[k]));
  }
  return [out, ""];
}

export const titleProblem = (t: string) => textProblem(t, 3, 80, "the title");
export const scopeProblem = (t: string) => textProblem(t, 20, 600, "the scope");
export const proposalProblem = (t: string) => textProblem(t, 40, 1200, "the proposal");
export const reasonProblem = (t: string) => textProblem(t, 20, 400, "the reason");

/** 16 to 64 ASCII letters and digits. */
export const isSalt = (s: unknown): boolean => typeof s === "string" && /^[A-Za-z0-9]{16,64}$/.test(s);
