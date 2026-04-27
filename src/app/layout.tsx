import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { GlobalNav } from "@/components/global-nav";
import { Providers } from "@/components/providers";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Columbia FBC Careers",
  description: "Fintech & Blockchain Club job board",
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
      suppressHydrationWarning
    >
      <body className="min-h-full">
        <Providers>
          <div className="flex min-h-full flex-col">
            <GlobalNav />
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
