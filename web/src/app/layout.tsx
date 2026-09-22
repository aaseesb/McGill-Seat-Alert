import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const sans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Seat Alert for McGill",
  description: "Get an email or phone notification when a seat opens in a full McGill course section.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <header className="site-header">
          <div className="wrap">
            <Link href="/" className="brand"><span className="brand-dot" aria-hidden />Seat Alert</Link>
            <nav className="nav">
              <Link href="/dashboard">My alerts</Link>
            </nav>
          </div>
        </header>
        <main><div className="wrap">{children}</div></main>
        <footer className="site-footer">
          <div className="wrap">
            <span>Not affiliated with McGill University.</span>
            <span>
              <Link href="/privacy">Privacy</Link> ·{" "}
              <a href="https://github.com/hanzili/mcgill-seat-alert">Based on hanzili/mcgill-seat-alert</a>
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
