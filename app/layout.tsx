import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { GameProvider } from "@/components/providers/GameProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Overvalued — is this résumé real?",
  description:
    "Every résumé is a prediction market. Buy YES if it passes the reference check, NO if it's an inflated LARP. You have $100.",
};

// Booth kiosk: lock the zoom, fill the notch, dark status bar.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#05060a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* No layout classes here on purpose: the exchange stylesheet's own
          `body` rule is unlayered, so it outranks Tailwind's utilities layer
          and was already winning. Sizing lives on .exchange-shell / .board-shell. */}
      <body>
        <GameProvider>{children}</GameProvider>
      </body>
    </html>
  );
}
