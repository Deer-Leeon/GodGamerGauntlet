import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Game cover art comes from the RAWG media CDN.
    remotePatterns: [{ protocol: "https", hostname: "media.rawg.io" }],
  },
};

export default nextConfig;
