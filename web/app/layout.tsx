import type { Metadata, Viewport } from "next";
import { Courier_Prime, Libre_Caslon_Text, Public_Sans } from "next/font/google";

import "./globals.css";
import { AppFrame } from "@/components/app-frame";
import { Providers } from "@/components/providers";
import { SITE_LINE, SITE_NAME, SITE_TAGLINE } from "@/lib/config";

// Libre Caslon for the notices' headings, Public Sans to read, Courier Prime for every figure.
const caslon = Libre_Caslon_Text({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-caslon", display: "swap" });
const publicSans = Public_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-public", display: "swap" });
const courier = Courier_Prime({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-courier", display: "swap" });

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: `${SITE_NAME}: the cheapest bid that meets every requirement wins`, template: `%s · ${SITE_NAME}` },
  description: SITE_LINE,
  applicationName: SITE_NAME,
  openGraph: { title: SITE_NAME, description: SITE_TAGLINE },
};

export const viewport: Viewport = {
  themeColor: "#B98A57",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${caslon.variable} ${publicSans.variable} ${courier.variable} antialiased`}>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-card-2 focus:px-3 focus:py-2 focus:text-ink">
          Skip to the page
        </a>
        <Providers>
          <AppFrame>{children}</AppFrame>
        </Providers>
      </body>
    </html>
  );
}
