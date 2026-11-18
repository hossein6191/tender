// POST /api/demo/move {"move": "open" | "bid" | "reveal" | "assess" | "place" | "award" | "complete" | "reclaim",
// "tender": "T3", "bid": "B7", "rival": "rival-a"}: one move of the demo clerk, signed only when
// lib/demo-script.ts lists it as a move the clerk may make now. Answers {ok, hash, note} or {ok: false, reason}.

import { sendMove } from "@/lib/demo-server";
import { parseBidId, parseTenderId } from "@/lib/format";
import type { DemoMove } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Opening waits up to forty seconds for the notice to be final, then the two rivals bid.
export const maxDuration = 60;

const MOVES: DemoMove[] = ["open", "bid", "reveal", "assess", "place", "award", "complete", "reclaim"];
const noStore = { "cache-control": "no-store" };

export async function POST(request: Request) {
  let want: { move: DemoMove; tender: string; bid: string; rival: string } | null = null;
  try {
    const text = await request.text();
    if (text.length > 300) throw new Error("too long");
    const b = JSON.parse(text) as Record<string, unknown>;
    const move = String(b.move ?? "") as DemoMove;
    const rival = String(b.rival ?? "");
    if (MOVES.includes(move)) want = { move, tender: parseTenderId(String(b.tender ?? "")), bid: b.bid ? parseBidId(String(b.bid)) : "", rival: rival === "rival-a" || rival === "rival-b" ? rival : "" };
  } catch {
    want = null;
  }
  if (!want || (want.move !== "open" && !want.tender)) return Response.json({ ok: false, reason: 'send {"move": "reveal", "tender": "T1", "rival": "rival-a"}' }, { status: 400, headers: noStore });
  const client = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
  const answer = await sendMove(want, client);
  return Response.json(answer.body, { status: answer.status, headers: noStore });
}
