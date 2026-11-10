import type { NextConfig } from "next";

// The browser only talks to this server, which forwards to the API. That keeps one address
// for everything, so a phone on the same Wi-Fi works without knowing about the backend.
const apiTarget = process.env.API_PROXY_TARGET ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${apiTarget}/api/:path*` },
      { source: "/media/:path*", destination: `${apiTarget}/media/:path*` },
    ];
  },
};

export default nextConfig;
