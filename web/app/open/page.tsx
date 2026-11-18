import type { Metadata } from "next";

import { OpenView } from "@/components/open-view";

export const metadata: Metadata = { title: "Open a tender" };

export default function OpenPage() {
  return <OpenView />;
}
