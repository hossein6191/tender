import type { Metadata } from "next";

import { RulesView } from "@/components/rules-view";

export const metadata: Metadata = { title: "How it works" };

export default function Page() {
  return <RulesView />;
}
