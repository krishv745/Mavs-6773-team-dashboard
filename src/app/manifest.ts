import type { MetadataRoute } from "next";
import { APP_NAME, TEAM_NAME } from "@/lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${APP_NAME} — FRC ${TEAM_NAME}`,
    short_name: APP_NAME,
    description: `${APP_NAME} — task manager, events, parts inventory, and work logs for FRC ${TEAM_NAME}.`,
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
