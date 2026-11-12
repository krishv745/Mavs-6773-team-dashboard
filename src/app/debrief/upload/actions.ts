"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyUploadToken } from "@/lib/googleChat/uploadLink";

// Same bucket as photos added from the dashboard's log form.
const MEDIA_BUCKET = "task-photos";
const MAX_FILE_BYTES = 50 * 1024 * 1024; // Supabase free-tier per-file cap
const MAX_FILES_PER_LOG = 20;

type FileInfo = { name: string; type: string; size: number };
type SignedUpload = { path: string; token: string };

function folderFor(logId: string) {
  return `logs/debrief/${logId}/`;
}

/**
 * Signed one-shot upload URLs for the files the visitor picked. The browser
 * uploads straight to Storage with them (no sign-in, no server-action body
 * limit); nothing lands on the log until attachMedia confirms the paths.
 */
export async function createUploads(
  token: string,
  files: FileInfo[],
): Promise<{ uploads: SignedUpload[] } | { error: string }> {
  const logId = verifyUploadToken(token);
  if (!logId) return { error: "This upload link has expired. Post a new /debrief to get a fresh one." };
  if (files.length === 0) return { error: "Pick at least one photo or video." };
  if (files.length > MAX_FILES_PER_LOG) return { error: `Up to ${MAX_FILES_PER_LOG} files at a time.` };
  for (const f of files) {
    if (!/^(image|video)\//.test(f.type)) return { error: `${f.name} isn't a photo or video.` };
    if (f.size > MAX_FILE_BYTES) return { error: `${f.name} is over 50 MB.` };
  }

  const admin = createAdminClient();
  const { data: log } = await admin.from("task_logs").select("photo_urls").eq("id", logId).maybeSingle();
  if (!log) return { error: "That debrief no longer exists." };
  if (log.photo_urls.length + files.length > MAX_FILES_PER_LOG) {
    return { error: `A debrief can have up to ${MAX_FILES_PER_LOG} photos/videos.` };
  }

  const uploads: SignedUpload[] = [];
  for (const f of files) {
    const ext = (f.name.split(".").pop() ?? "").replace(/[^a-z0-9]/gi, "").slice(0, 10).toLowerCase();
    const path = `${folderFor(logId)}${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext || "dat"}`;
    const { data, error } = await admin.storage.from(MEDIA_BUCKET).createSignedUploadUrl(path);
    if (error || !data) return { error: "Couldn't start the upload. Try again." };
    uploads.push({ path, token: data.token });
  }
  return { uploads };
}

/** Adds the uploaded files to the log, once they're actually in Storage. */
export async function attachMedia(token: string, paths: string[]): Promise<{ count: number } | { error: string }> {
  const logId = verifyUploadToken(token);
  if (!logId) return { error: "This upload link has expired. Post a new /debrief to get a fresh one." };
  const folder = folderFor(logId);
  if (paths.length === 0 || paths.some((p) => !p.startsWith(folder) || p.includes(".."))) {
    return { error: "Those files don't belong to this debrief." };
  }

  const admin = createAdminClient();
  const { data: stored } = await admin.storage.from(MEDIA_BUCKET).list(folder.slice(0, -1), { limit: 100 });
  const present = new Set((stored ?? []).map((o) => folder + o.name));
  const urls = paths
    .filter((p) => present.has(p))
    .map((p) => admin.storage.from(MEDIA_BUCKET).getPublicUrl(p).data.publicUrl);
  if (urls.length === 0) return { error: "The upload didn't finish. Try again." };

  const { data: log } = await admin.from("task_logs").select("photo_url, photo_urls").eq("id", logId).maybeSingle();
  if (!log) return { error: "That debrief no longer exists." };
  const merged = [...log.photo_urls, ...urls.filter((u) => !log.photo_urls.includes(u))].slice(0, MAX_FILES_PER_LOG);
  const { error } = await admin
    .from("task_logs")
    .update({ photo_urls: merged, photo_url: log.photo_url ?? merged[0] ?? null })
    .eq("id", logId);
  if (error) return { error: "Couldn't save to the dashboard. Try again." };

  revalidatePath("/team/projects");
  revalidatePath("/team/projects/my-tasks");
  revalidatePath("/team/log");
  return { count: merged.length };
}
