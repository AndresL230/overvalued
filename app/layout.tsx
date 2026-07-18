import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;

  return {
    metadataBase: new URL(origin),
    title: {
      default: "Overvalued — Candidate Exchange",
      template: "%s · Overvalued",
    },
    description: "A live prediction market for the claims on your résumé.",
    applicationName: "Overvalued",
    keywords: ["party game", "prediction market", "resume", "builders cup"],
    openGraph: {
      title: "Overvalued — Candidate Exchange",
      description: "Trade the résumé. Watch the room decide.",
      type: "website",
      images: [{ url: "/og.png", width: 1733, height: 909, alt: "Overvalued Candidate Exchange — 67% YES" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Overvalued — Candidate Exchange",
      description: "Trade the résumé. Watch the room decide.",
      images: ["/og.png"],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
