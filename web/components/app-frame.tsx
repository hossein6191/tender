"use client";

// The frame of every page: the municipal letterhead pinned across the top of the cork board (the crest,
// the name, the office line and the wallet), the six places as index tabs, and the footer with the
// register and its source. In mock mode the striped mock bar sits above it all.

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";

import { Crest } from "@/components/logo";
import { MockBar } from "@/components/mock-bar";
import { WalletButton, WrongChainBanner } from "@/components/wallet";
import { addressUrl, contractInUse, hasContract, isMock } from "@/lib/chain";
import { REPO_URL } from "@/lib/config";
import { cx } from "@/lib/cx";

const NAV = [
  { href: "/", label: "Noticeboard" },
  { href: "/open", label: "Open a tender" },
  { href: "/mine", label: "My bids" },
  { href: "/ledger", label: "Register" },
  { href: "/how", label: "How it works" },
];

export function AppFrame({ children }: { children: React.ReactNode }) {
  const path = usePathname() || "/";
  const here = (href: string) => (href === "/" ? path === "/" || path.startsWith("/tender") : path.startsWith(href));
  return (
    <>
      {isMock && <MockBar />}
      <header className="mx-auto max-w-[1120px] px-3 pt-5 sm:px-4">
        <div className="sheet pinned-l pinned px-4 pt-3 pb-0 sm:px-6">
          <div className="letterhead flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pb-2.5">
            <Link href="/" className="flex min-w-0 items-center gap-3">
              <Crest size={46} />
              <span className="min-w-0">
                <span className="head block text-[30px] leading-none font-bold tracking-[0.06em]">TENDER</span>
                <span className="smallcaps block truncate text-[13px] text-ink-2">Office of Public Works · Notices of Tender</span>
              </span>
            </Link>
            {!isMock && <WalletButton />}
          </div>
          <nav aria-label="Pages" className="-mx-1 overflow-hidden">
            <ul className="flex flex-wrap">
              {NAV.map((n) => (
                <li key={n.href}>
                  <Link
                    href={n.href}
                    aria-current={here(n.href) ? "page" : undefined}
                    className={cx("smallcaps block border-b-[3px] px-2 py-2 text-[15px] font-bold sm:px-3", here(n.href) ? "border-wax text-ink" : "border-transparent text-ink-2 hover:text-ink")}
                  >
                    {n.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>
      {!isMock && <WrongChainBanner />}
      <main id="main" className="mx-auto w-full max-w-[1120px] px-3 pt-8 pb-16 sm:px-4">
        {children}
      </main>
      <footer className="mx-auto max-w-[1120px] px-3 pb-8 sm:px-4">
        <div className="sheet-plain flex flex-col gap-1 px-4 py-3 text-[13px] text-ink-2 sm:flex-row sm:justify-between">
          <p className="min-w-0">
            A GenLayer Intelligent Contract on Studio (chain 61999).{" "}
            {hasContract() && !isMock ? (
              <a href={addressUrl(contractInUse())} target="_blank" rel="noreferrer" className="mono link break-all text-ink">
                {contractInUse()}
              </a>
            ) : isMock ? (
              "Mock build: no register."
            ) : (
              "The register is not deployed yet."
            )}
          </p>
          {REPO_URL && (
            <a href={REPO_URL} target="_blank" rel="noreferrer" className="link text-ink">
              Source
            </a>
          )}
        </div>
      </footer>
    </>
  );
}
