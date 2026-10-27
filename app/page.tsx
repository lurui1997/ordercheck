import { Noto_Sans_SC } from "next/font/google";
import { LandingPage } from "@/components/landing/landing-page";

const noto = Noto_Sans_SC({
  subsets: ["latin"],
  weight: ["400", "600"],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  fallback: ["PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Noto Sans CJK SC", "Microsoft YaHei", "sans-serif"],
});

export default function HomePage() {
  return (
    <div className={`${noto.className} min-h-screen bg-zinc-950 text-base text-zinc-100 antialiased selection:bg-indigo-500/30`}>
      <LandingPage />
    </div>
  );
}
