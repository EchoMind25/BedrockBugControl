import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Phase 2: add recharts and other future deps to transpilePackages if needed
  experimental: {
    // serverActions are stable in Next 15
  },
  // Security headers
  async headers() {
    return [
      {
        source: "/api/bcc/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
