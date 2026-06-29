import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "HyperA — Autonomous Scalping System",
  description: "HyperA: AI-powered autonomous scalping agent for Hyperliquid with 8 signal types, Hypurrscan whale tracking, and market sentiment analysis.",
  keywords: ["HyperA", "Hyperliquid", "AI Trading", "Scalping", "DeFi", "Perpetuals", "Whale Tracking", "Hypurrscan"],
  authors: [{ name: "HyperA" }],
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "HyperA — Autonomous Scalping System",
    description: "AI-powered scalping agent for Hyperliquid with whale tracking and market sentiment",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
