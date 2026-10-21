import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FRC Max Throttle Mavericks 6773 — Team Management App",
    short_name: "Mavericks 6773",
    description:
      "Task manager, events, parts inventory, and clock log for FRC Max Throttle Mavericks 6773.",
    start_url: "/team/projects",
    scope: "/team",
    display: "standalone",
    background_color: "#43484d",
    theme_color: "#4b5320",
    icons: [
      { src: "/logo.png", sizes: "192x192", type: "image/png" },
      { src: "/logo.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
