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
  description: "OrderCheck 读一张订单的买卖往来，列出未确认事项和证据，起草确认邮件，并如实记录外发。",
  applicationName: "OrderCheck",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className="scroll-smooth">
      <body className={`${sourceSans.variable} antialiased`}>{children}</body>
    </html>
  );
}
