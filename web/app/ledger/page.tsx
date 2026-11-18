import type { Metadata } from "next";

import { LedgerView } from "@/components/ledger-view";

export const metadata: Metadata = { title: "The register" };

export default function Page() {
  return <LedgerView />;
}
