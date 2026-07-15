import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ProductLens AI",
  description: "AI product analysis assistant for Amazon product links"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
