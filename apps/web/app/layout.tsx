import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "base-orchestrator",
  description:
    "Local-first Base wallet automation, portfolio testing, and transaction management dashboard."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
