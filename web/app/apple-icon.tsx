import { ImageResponse } from "next/og";

import { CORK, markDataUri } from "@/lib/mark";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// The app icon: the wax-sealed envelope pinned to cork.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: CORK }}>
        <img src={markDataUri()} width={180} height={180} alt="" />
      </div>
    ),
    size,
  );
}
