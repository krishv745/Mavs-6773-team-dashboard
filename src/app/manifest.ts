import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tech Titans 25783 — Team App",
    short_name: "Tech Titans",
    description: "Task manager, events, parts inventory, and clock log for Tech Titans 25783.",
    start_url: "/team/projects",
    scope: "/team",
    display: "standalone",
    background_color: "#0e173f",
    theme_color: "#0e173f",
    icons: [
      { src: "/logo.png", sizes: "192x192", type: "image/png" },
      { src: "/logo.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
