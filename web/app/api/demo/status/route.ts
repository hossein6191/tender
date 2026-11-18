// GET /api/demo/status: whether the demo clerk can act now, the three public addresses it derives from
// DEMO_KEY (the demo school and the two rival decorators), the newest demo tender and its phase, and exactly
// why not when it cannot: "no key set", "the key set is not a 0x private key of 64 hex characters", "the
// contract is not deployed yet", Studio's RPC not answering, or a demo account with too little GEN. The key
// is never echoed.

import { demoStatusNow } from "@/lib/demo-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  return Response.json(await demoStatusNow(), { headers: { "cache-control": "no-store" } });
}
