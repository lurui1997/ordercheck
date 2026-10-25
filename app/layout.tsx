import type { Metadata } from "next";
import { Fraunces, Source_Sans_3 } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
});

const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-source",
});

export const metadata: Metadata = {
  title: "OrderCheck · 跨境订单漏项核对",
  description: "在发送订单确认之前，核对双方邮件里还没对齐的交付、样品和包装范围。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className={`${fraunces.variable} ${sourceSans.variable} antialiased`}>{children}</body>
    </html>
  );
}
