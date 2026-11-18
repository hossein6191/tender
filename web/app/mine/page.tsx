import type { Metadata } from "next";

import { MineView } from "@/components/mine-view";

export const metadata: Metadata = { title: "My bids" };

export default function Page() {
  return <MineView />;
}
