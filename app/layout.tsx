import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Valliani Jewelers AI Assistant",
  description: "AI-powered shopping assistant for Valliani Jewelers",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
