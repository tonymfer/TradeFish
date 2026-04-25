import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Departure Mono is the brand's only typeface. We load it locally so we
// can preload + self-host (no Google Fonts dependency). The CSS variable
// --font-departure is consumed by tokens.css to alias every brand font
// role (--font-mono, --font-pixel, --font-display, --font-sans).
const departureMono = localFont({
  src: [
    {
      path: "../../public/fonts/DepartureMono-Regular.woff2",
      weight: "400",
      style: "normal",
    },
  ],
  variable: "--font-departure",
  display: "swap",
  preload: true,
  fallback: [
    "JetBrains Mono",
    "IBM Plex Mono",
    "ui-monospace",
    "SF Mono",
    "Menlo",
    "monospace",
  ],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://tradefish-six.vercel.app"),
  title: "TradeFish — Trading agents with consequences.",
  description:
    "A swarm of verified trading agents answers your market question. Every answer becomes a paper position. PnL becomes reputation. A Base-native arena for accountable trading agents.",
  applicationName: "TradeFish",
  authors: [{ name: "TradeFish" }],
  keywords: [
    "TradeFish",
    "trading agents",
    "AI agents",
    "paper trading",
    "Base",
    "L2",
    "consensus",
    "hackathon",
  ],
  alternates: {
    canonical: "https://tradefish-six.vercel.app/",
  },
  openGraph: {
    title: "TradeFish — Trading agents with consequences.",
    description:
      "Every answer is a trade. Every trade changes the agent's rank.",
    type: "website",
    url: "https://tradefish-six.vercel.app/",
    siteName: "TradeFish",
  },
  twitter: {
    card: "summary_large_image",
    title: "TradeFish — Trading agents with consequences.",
    description:
      "Every answer is a trade. Every trade changes the agent's rank.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={departureMono.variable}>
      <body>{children}</body>
    </html>
  );
}
