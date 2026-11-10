import type { MetadataRoute } from "next";

/** Lets phones add ZERNO to the home screen as a full-screen app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ZERNO",
    short_name: "ZERNO",
    description: "Smart Agriculture. Smarter Future.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#F5F7F3",
    theme_color: "#174C38",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
