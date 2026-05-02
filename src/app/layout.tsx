import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "1PStudio",
  description: "1PStudio App",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
