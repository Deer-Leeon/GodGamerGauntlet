import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { AuthProvider } from "@/lib/auth";
import SiteNav from "@/components/SiteNav";
import ControlRail from "@/components/ControlRail";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "God Gamer Gauntlet",
  description:
    "Draft 10 games, survive the gauntlet, prove you are the god gamer.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} antialiased`}
    >
      <body className="bg-dark text-muted">
        <AuthProvider>
          <div className="site-shell">
            <SiteNav />
            {children}
            <ControlRail />
          </div>
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  );
}
