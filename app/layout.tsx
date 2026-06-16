import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GTM OS | Portfolio Demo",
  description: "Cited GTM answers from messy fictional business documents.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
