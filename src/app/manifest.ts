import type { MetadataRoute } from "next";

/** Makes MyPaddie installable: Chrome → ⋮ → "Add to Home screen". */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MyPaddie",
    short_name: "Paddie",
    description: "Here are the 3 things that matter right now. Do one.",
    start_url: "/app",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0e0f13",
    theme_color: "#0e0f13",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
