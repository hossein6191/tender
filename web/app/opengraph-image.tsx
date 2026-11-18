import { ImageResponse } from "next/og";

import { BRASS, CORK, COUNCIL, INK, MEETS, MISSES, PAPER, WAX, markDataUri } from "@/lib/mark";
import { cardFonts } from "@/lib/og-fonts";

export const alt = "Tender: sealed bids, every proposal read against the requirements by GenLayer's validators, and the cheapest compliant bid wins.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const HEAD = "TENDER";
const LINE = "The cheapest bid that meets every requirement wins.";
const ROWS: [string, string, string[]][] = [
  ["B1", "0.6 GEN", ["y", "n", "y"]],
  ["B2", "0.8 GEN", ["y", "y", "y"]],
  ["B3", "1.0 GEN", ["y", "y", "y"]],
];

// The share card: cork, a printed notice pinned on the left with the promise, and a tabulation sheet on the
// right with three bids in pencil and the AWARDED stamp over the cheapest all-tick one.
export default async function OpenGraphImage() {
  const fonts = await cardFonts(HEAD + LINE + "AWARDEDNotice of tenderRepaint Elm Street Primary classroomsTabulation", ROWS.map((r) => r[0] + r[1]).join("") + "R123");
  const head = fonts.length ? "Libre Caslon Text" : "serif";
  const mono = fonts.length ? "Courier Prime" : "monospace";
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", backgroundColor: CORK, fontFamily: head, position: "relative" }}>
        <div style={{ position: "absolute", left: 60, top: 70, width: 540, height: 480, backgroundColor: PAPER, display: "flex", flexDirection: "column", padding: "40px 40px", transform: "rotate(-1.5deg)", boxShadow: "6px 10px 0 rgba(60,36,14,0.25)" }}>
          <div style={{ position: "absolute", top: -12, left: 255, width: 26, height: 26, borderRadius: 13, backgroundColor: BRASS, display: "flex" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 16, borderBottom: `4px solid ${INK}`, paddingBottom: 12 }}>
            <img src={markDataUri()} width={70} height={70} alt="" />
            <div style={{ fontSize: 64, fontWeight: 700, color: INK, letterSpacing: 6 }}>{HEAD}</div>
          </div>
          <div style={{ display: "flex", marginTop: 28, fontSize: 46, fontWeight: 700, color: INK, lineHeight: 1.12 }}>{LINE}</div>
          <div style={{ display: "flex", marginTop: 26, fontSize: 26, color: WAX }}>Sealed bids · judged by GenLayer</div>
        </div>
        <div style={{ position: "absolute", right: 60, top: 110, width: 500, height: 410, backgroundColor: PAPER, display: "flex", flexDirection: "column", padding: "30px 32px", transform: "rotate(1.8deg)", boxShadow: "6px 10px 0 rgba(60,36,14,0.25)" }}>
          <div style={{ display: "flex", fontSize: 30, fontWeight: 700, color: INK, borderBottom: `3px solid ${INK}`, paddingBottom: 8 }}>Tabulation of bids</div>
          {ROWS.map(([id, price, marks]) => (
            <div key={id} style={{ display: "flex", alignItems: "center", borderBottom: "2px solid #9DB4D6", padding: "18px 0", fontFamily: mono, fontSize: 30, color: INK }}>
              <div style={{ display: "flex", width: 80 }}>{id}</div>
              <div style={{ display: "flex", width: 170 }}>{price}</div>
              {marks.map((m, i) => (
                <div key={i} style={{ display: "flex", width: 54 }}>
                  {m === "y" ? (
                    <svg width="34" height="30" viewBox="0 0 22 20">
                      <path d="M2.5 11.5c2 1.2 3.6 3.2 5 5.6C10 11 14 5.5 20 2" fill="none" stroke={MEETS} strokeWidth="2.8" strokeLinecap="round" />
                    </svg>
                  ) : (
                    <svg width="30" height="30" viewBox="0 0 20 20">
                      <path d="M3 3.5c4.5 4 9 8.6 14 13.2M16.5 3c-4 4.4-8.6 9-13.5 14" fill="none" stroke={MISSES} strokeWidth="2.8" strokeLinecap="round" />
                    </svg>
                  )}
                </div>
              ))}
            </div>
          ))}
          <div style={{ position: "absolute", right: 30, bottom: 34, display: "flex", fontSize: 40, fontWeight: 700, color: MEETS, border: `6px solid ${MEETS}`, padding: "4px 18px", transform: "rotate(-8deg)", letterSpacing: 6 }}>AWARDED</div>
          <div style={{ position: "absolute", left: 32, bottom: 40, display: "flex", fontSize: 22, color: COUNCIL }}>B2 wins: B1 misses low-VOC</div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
