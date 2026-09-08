import type { Metadata } from "next";
import { JetBrains_Mono, Outfit, Syne } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { AuthProvider } from "@/lib/auth";
import SiteNav from "@/components/SiteNav";
import ControlRail from "@/components/ControlRail";
import BrowseRail from "@/components/BrowseRail";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "God Gamer Gauntlet",
  description:
    "Draft 3, 5, or 7 games. Speedrun them start to finish.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${outfit.variable} ${syne.variable} ${jetbrainsMono.variable} antialiased`}
    >
      <body className="bg-dark text-muted">
        <AuthProvider>
          <div className="site-shell">
            <SiteNav />
            {children}
            <BrowseRail />
            <ControlRail />
          </div>
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  );
}
