"use client";

// The one button of the site: a ruled civic-office button in council blue ink, with a heavy lower rule that
// presses in. Three kinds: primary (the thing to do), ok (money coming to you), plain (everything else).

import * as React from "react";
import Link from "next/link";

import { cx } from "@/lib/cx";

type Variant = "primary" | "ok" | "plain" | "danger";
type Common = { variant?: Variant; size?: "sm" | "md"; block?: boolean; icon?: React.ReactNode; className?: string; children: React.ReactNode };

const classes = (variant: Variant, size: "sm" | "md", block?: boolean, className?: string) => cx("btn", `btn-${variant}`, size === "sm" && "btn-sm", block && "btn-block", className);

export function Button({ variant = "primary", size = "md", block, icon, className, children, type = "button", ...rest }: Common & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children" | "className">) {
  return (
    <button type={type} className={classes(variant, size, block, className)} {...rest}>
      {icon}
      <span>{children}</span>
    </button>
  );
}

export function ButtonLink({ variant = "primary", size = "md", block, icon, className, children, href }: Common & { href: string }) {
  return (
    <Link href={href} className={classes(variant, size, block, className)}>
      {icon}
      <span>{children}</span>
    </Link>
  );
}
