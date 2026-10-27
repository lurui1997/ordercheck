import type { Metadata } from "next";
import { Source_Sans_3 } from "next/font/google";
import "./globals.css";

const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-source",
});

export const metadata: Metadata = {
  title: "OrderCheck · 订单确认工作台",
  description: "卖方在发送订单确认前，核对双方往来里尚未对齐的交付、样品和包装范围。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className={`${sourceSans.variable} antialiased`}>{children}</body>
    </html>
  );
}
