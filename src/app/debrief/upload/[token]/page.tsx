import type { Metadata } from "next";
import Image from "next/image";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyUploadToken } from "@/lib/googleChat/uploadLink";
import { APP_NAME, TEAM_NAME } from "@/lib/brand";
import DebriefUploader from "./DebriefUploader";

export const metadata: Metadata = { title: "Add photos & videos", robots: { index: false } };

/**
 * Opened from the "Add photos / videos" button in the Google Chat /debrief
 * popup. No sign-in: the signed link itself is the permission, scoped to one
 * log and valid for 24 hours. Lives outside /team so the session middleware
 * doesn't redirect to the login page.
 */
export default async function DebriefUploadPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const logId = verifyUploadToken(decodeURIComponent(token));

  let body: React.ReactNode;
  if (!logId) {
    body = <Notice title="This link has expired">Post a new <code>/debrief</code> in Google Chat to get a fresh one.</Notice>;
  } else {
    const admin = createAdminClient();
    const { data: log } = await admin
      .from("task_logs")
      .select("description, task_title, photo_urls, task_id, user_id")
      .eq("id", logId)
      .maybeSingle();
    if (!log) {
      body = <Notice title="Debrief not found">It may have been deleted from the dashboard.</Notice>;
    } else {
      const [{ data: task }, { data: poster }] = await Promise.all([
        log.task_id
          ? admin.from("tasks").select("title").eq("id", log.task_id).maybeSingle()
          : Promise.resolve({ data: null }),
        log.user_id
          ? admin.from("users").select("name").eq("id", log.user_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      body = (
        <DebriefUploader
          token={decodeURIComponent(token)}
          taskTitle={task?.title ?? log.task_title ?? "Task"}
          posterName={poster?.name ?? ""}
          description={log.description ?? ""}
          existingCount={log.photo_urls.length}
        />
      );
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-navy via-navy to-crimson">
      <div className="flex flex-1 flex-col items-center px-4 py-10 sm:justify-center sm:py-16">
        <div className="mb-6 flex items-center gap-3">
          <Image src="/logo.png" alt={TEAM_NAME} width={44} height={44} />
          <span className="flex flex-col gap-1 leading-none">
            <span className="font-display text-xl font-bold uppercase tracking-tight text-white">{APP_NAME}</span>
            <span className="text-[11px] font-medium uppercase tracking-widest text-white/60">Debrief photos & videos</span>
          </span>
        </div>
        <div className="w-full max-w-md rounded-xl bg-surface p-6 shadow-2xl sm:p-8">{body}</div>
      </div>
    </div>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <h1 className="font-display text-xl font-bold text-ink">{title}</h1>
      <p className="mt-2 text-sm text-ink/70">{children}</p>
    </>
  );
}
