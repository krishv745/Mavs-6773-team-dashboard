import { redirect } from "next/navigation";
import { getCurrentProfile, isParent } from "@/lib/auth/session";

export default async function TeamIndexPage() {
  const profile = await getCurrentProfile();
  redirect(isParent(profile) ? "/team/events" : "/team/projects");
}
