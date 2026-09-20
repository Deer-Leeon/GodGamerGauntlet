import type { Metadata } from "next";
import { JetBrains_Mono, Outfit, Syne } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { AuthProvider } from "@/lib/auth";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";
import ControlRail from "@/components/ControlRail";
import BrowseRail from "@/components/BrowseRail";
import OverlayShell from "@/components/OverlayShell";
import { SITE_DESCRIPTION, SITE_URL } from "@/lib/site";
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
      className={`${outfit.variable} ${syne.variable} ${jetbrainsMono.variable} antialiased`}
    >
      <body className="bg-dark text-muted">
        <AuthProvider>
          <OverlayShell>
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
