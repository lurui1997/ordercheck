import type { Metadata } from "next";
import { DM_Sans, Noto_Sans_SC } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm",
  display: "swap",
});

const notoSans = Noto_Sans_SC({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-noto",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
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
      <body className={`${dmSans.variable} ${notoSans.variable} antialiased`}>{children}</body>
    </html>
  );
}
