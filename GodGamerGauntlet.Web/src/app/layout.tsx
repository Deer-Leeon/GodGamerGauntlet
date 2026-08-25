import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { AuthProvider } from "@/lib/auth";
import SiteNav from "@/components/SiteNav";
import ControlRail from "@/components/ControlRail";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
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
      className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} antialiased`}
    >
      <body className="bg-dark text-gray-100">
        <AuthProvider>
          <div className="site-shell">
            <SiteNav />
            {children}
            <ControlRail />
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
