import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ale Parade Challenge",
    short_name: "Ale Parade",
    description: "Split-the-G tally for the crew. First sip decides.",
    start_url: "/",
    display: "standalone",
    background_color: "#14100b",
    theme_color: "#14100b",
    icons: [
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
      { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
