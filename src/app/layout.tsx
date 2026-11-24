import type { Metadata } from "next";
import { Bricolage_Grotesque, Inter_Tight } from "next/font/google";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-display",
});

const interTight = Inter_Tight({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://verinav.vercel.app"),
  title: "VeriNAV — Capital Structure & Flow Truth Audit Desk",
  description:
    "Separate organic spot ETF demand from hedge-fund carry arbitrage, audit corporate crypto treasury mNAV premiums, and route cleaner on-chain execution via SoSoValue & SoDEX.",
  icons: {
    icon: "/logo-icon.jpg",
    apple: "/logo-icon.jpg",
  },
  openGraph: {
    title: "VeriNAV — Capital Structure & Flow Truth Audit Desk",
    description:
      "Separate organic spot ETF demand from hedge-fund carry arbitrage, audit corporate crypto treasury mNAV premiums, and route cleaner on-chain execution via SoSoValue & SoDEX.",
    images: [
      {
        url: "/logo-banner.jpg",
        width: 1200,
        height: 675,
        alt: "VeriNAV",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "VeriNAV — Capital Structure & Flow Truth Audit Desk",
    images: ["/logo-banner.jpg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${bricolage.variable} ${interTight.variable}`}>
      <body>{children}</body>
    </html>
  );
}
