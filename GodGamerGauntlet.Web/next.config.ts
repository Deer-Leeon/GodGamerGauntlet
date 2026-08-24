import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Game thumbnails come from CheapShark / Steam CDNs.
    remotePatterns: [
      { protocol: "https", hostname: "**.cheapshark.com" },
      { protocol: "https", hostname: "**.steamstatic.com" },
      { protocol: "https", hostname: "**.akamai.steamstatic.com" },
    ],
  },
};

export default nextConfig;
