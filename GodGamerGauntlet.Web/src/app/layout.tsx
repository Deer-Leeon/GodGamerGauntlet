import type { Metadata } from "next";
import Script from "next/script";
import { JetBrains_Mono, Outfit, Press_Start_2P, Russo_One } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { AuthProvider } from "@/lib/auth";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";
import ControlRail from "@/components/ControlRail";
import BrowseRail from "@/components/BrowseRail";
import OverlayShell from "@/components/OverlayShell";
import ChromeReady from "@/components/ChromeReady";
import { CHROME_BOOT_SCRIPT } from "@/lib/chromeBoot";
import { SITE_DESCRIPTION, SITE_URL } from "@/lib/site";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

const russo = Russo_One({
  weight: "400",
  variable: "--font-russo",
  subsets: ["latin"],
});

const pressStart = Press_Start_2P({
  weight: "400",
  variable: "--font-press-start",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "God Gamer Gauntlet",
    template: "%s · God Gamer Gauntlet",
  },
  description: SITE_DESCRIPTION,
  openGraph: {
    title: "God Gamer Gauntlet",
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    siteName: "God Gamer Gauntlet",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "God Gamer Gauntlet",
    description: SITE_DESCRIPTION,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${outfit.variable} ${russo.variable} ${pressStart.variable} ${jetbrainsMono.variable} antialiased`}
    >
      <body className="bg-dark text-muted">
        <Script
          id="ggg-chrome-boot"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: CHROME_BOOT_SCRIPT }}
        />
        <AuthProvider>
          <OverlayShell>
            <ChromeReady />
            <div className="site-shell">
              <SiteNav />
              {children}
              <SiteFooter />
              <BrowseRail />
              <ControlRail />
            </div>
          </OverlayShell>
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  );
}
