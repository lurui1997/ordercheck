import type { Metadata } from "next";
import { Source_Sans_3 } from "next/font/google";
import "./globals.css";

const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-source",
});

export const metadata: Metadata = {
  title: {
    default: "OrderCheck · 发确认之前的订单核对",
    template: "%s",
  },
  description: "发确认前，先看这一张订单邮件里没说清的地方。",
  applicationName: "OrderCheck",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className="scroll-smooth">
      <body className={`${sourceSans.variable} antialiased`}>{children}</body>
    </html>
  );
}
