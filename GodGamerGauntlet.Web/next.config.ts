import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // RAWG covers plus Wikimedia logos for web-native featured titles.
    remotePatterns: [
      { protocol: "https", hostname: "media.rawg.io" },
      { protocol: "https", hostname: "upload.wikimedia.org" },
    ],
  },
};

export default nextConfig;
