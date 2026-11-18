import type { Metadata } from "next";

import { TenderView } from "@/components/tender-view";
import { parseTenderId } from "@/lib/format";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Tender ${parseTenderId(id) || id}` };
}

export default async function TenderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tid = parseTenderId(decodeURIComponent(id));
  if (!tid) return <p className="sheet-plain px-4 py-3">That is not a tender number. Tender numbers look like T3.</p>;
  return <TenderView id={tid} />;
}
