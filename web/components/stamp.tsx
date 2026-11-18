// The rubber stamp of the clerk's office: AWARDED in green, NO AWARD and KNOCKED OUT in red, PAID in blue.

import { cx } from "@/lib/cx";

const TONE = { ok: "text-ok", no: "text-no", council: "text-council", amber: "text-amber" } as const;

export function Stamp({ children, tone = "ok", size = "md", className }: { children: React.ReactNode; tone?: keyof typeof TONE; size?: "sm" | "md" | "lg"; className?: string }) {
  return <span className={cx("stamp stamp-in", TONE[tone], size === "lg" ? "text-[30px]" : size === "sm" ? "text-[12px] !border-[3px]" : "text-[19px]", className)}>{children}</span>;
}
