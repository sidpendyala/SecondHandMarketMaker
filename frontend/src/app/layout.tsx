import type { Metadata } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-terminal",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Second Hand MarketMaker",
  description:
    "AI-powered deal intelligence for second-hand goods. Find underpriced listings and arbitrage opportunities.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${ibmPlexMono.variable} antialiased`}
        style={{ fontFamily: "var(--font-terminal), monospace" }}
      >
        {children}
      </body>
    </html>
  );
}
