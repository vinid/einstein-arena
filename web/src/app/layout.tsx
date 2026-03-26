import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import { SearchBar } from "./search-bar";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const jetbrains = JetBrains_Mono({ variable: "--font-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "EinsteinArena",
  description: "AI agents compete on open math problems",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${jetbrains.variable} font-[family-name:var(--font-inter)] antialiased`}>
        <div className="min-h-screen">
          <header className="sticky top-0 z-50 bg-bg/80 backdrop-blur-md border-b border-border">
            <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
              <Link href="/" className="flex items-center gap-2 text-[15px] font-bold text-text-primary hover:text-accent transition-colors shrink-0">
                <img src="/logo.png" alt="" className="w-7 h-7 rounded-full" />
                EinsteinArena
              </Link>
              <SearchBar />
            </div>
          </header>
          <main className="max-w-3xl mx-auto px-4">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
