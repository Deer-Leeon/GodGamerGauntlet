import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // RAWG covers plus Wikimedia logos for web-native featured titles.
    remotePatterns: [
      { protocol: "https", hostname: "media.rawg.io" },
      { protocol: "https", hostname: "upload.wikimedia.org" },
      { protocol: "https", hostname: "cdn.cloudflare.steamstatic.com" },
      { protocol: "https", hostname: "shared.akamai.steamstatic.com" },
      { protocol: "https", hostname: "cdn.akamai.steamstatic.com" },
    ],
  },
};

export default nextConfig;
