import type { Metadata } from "next";
import Link from "next/link";
import { CreditChip } from "@/components/CreditChip";
import "./globals.css";

export const metadata: Metadata = {
  title: "1P Clip",
  description: "One long video in. Ranked, captioned, vertical clips out.",
};

const NAV = [
  { href: "/", label: "New video" },
  { href: "/projects", label: "Projects" },
  { href: "/publications", label: "Publishing" },
  { href: "/credits", label: "Credits" },
  { href: "/tools/metadata", label: "Metadata tool" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="border-b border-edge">
          <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-4">
            <Link href="/" className="text-lg font-black tracking-tight">
              1P <span className="text-gold">CLIP</span>
            </Link>
            <nav className="flex flex-1 gap-4 text-sm text-zinc-400">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="hover:text-zinc-100">
                  {n.label}
                </Link>
              ))}
            </nav>
            <CreditChip />
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
