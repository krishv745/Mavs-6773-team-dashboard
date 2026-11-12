"use client";

import { useRef, useState } from "react";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import { attachMedia, createUploads } from "../actions";

const MEDIA_BUCKET = "task-photos";
const MAX_FILE_BYTES = 50 * 1024 * 1024;

type Phase = "pick" | "uploading" | "done";

export default function DebriefUploader(props: {
  token: string;
  taskTitle: string;
  posterName: string;
  description: string;
  existingCount: number;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const pickRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [phase, setPhase] = useState<Phase>("pick");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(props.existingCount);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const picked = Array.from(list);
    const tooBig = picked.find((f) => f.size > MAX_FILE_BYTES);
    setError(tooBig ? `${tooBig.name} is over 50 MB — trim it or pick a shorter clip.` : null);
    setFiles((prev) => [...prev, ...picked.filter((f) => f.size <= MAX_FILE_BYTES)]);
  }

  async function upload() {
    setError(null);
    setPhase("uploading");
    setProgress(0);
    const started = await createUploads(
      props.token,
      files.map((f) => ({ name: f.name, type: f.type, size: f.size })),
    );
    if ("error" in started) {
      setError(started.error);
      setPhase("pick");
      return;
    }

    const supabase = createBrowserClient();
    const done: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const { path, token } = started.uploads[i];
      const { error: upErr } = await supabase.storage
        .from(MEDIA_BUCKET)
        .uploadToSignedUrl(path, token, files[i], { contentType: files[i].type || undefined });
      if (!upErr) done.push(path);
      setProgress(i + 1);
    }

    if (done.length === 0) {
      setError("The upload failed. Check your connection and try again.");
      setPhase("pick");
      return;
    }
    const saved = await attachMedia(props.token, done);
    if ("error" in saved) {
      setError(saved.error);
      setPhase("pick");
      return;
    }
    setTotal(saved.count);
    setFiles([]);
    setPhase("done");
    if (done.length < files.length) setError(`${files.length - done.length} file(s) didn't upload. You can add them again.`);
  }

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-widest text-crimson">{props.taskTitle}</p>
      <h1 className="mt-1 font-display text-xl font-bold text-ink">
        {phase === "done" ? "Added to your debrief ✓" : "Add photos & videos"}
      </h1>
      {props.description && (
        <p className="mt-2 line-clamp-3 border-l-2 border-hairline-strong pl-3 text-sm text-ink/60">
          {props.posterName && <span className="font-medium text-ink/80">{props.posterName}: </span>}
          {props.description}
        </p>
      )}

      {phase === "done" ? (
        <>
          <p className="mt-4 text-sm text-ink/70">
            This debrief now has {total} photo{total === 1 ? "" : "s"}/video{total === 1 ? "" : "s"} on the dashboard.
            Close this tab and go back to Google Chat to post it.
          </p>
          <button
            type="button"
            onClick={() => setPhase("pick")}
            className="mt-4 text-sm font-semibold text-navy hover:underline"
          >
            Add more
          </button>
        </>
      ) : (
        <>
          <div className="mt-5 flex gap-2">
            <button
              type="button"
              disabled={phase === "uploading"}
              onClick={() => cameraRef.current?.click()}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-hairline-strong bg-tint px-3 py-2.5 text-sm font-medium text-ink/70 transition hover:bg-hairline disabled:opacity-50"
            >
              📷 Take photo
            </button>
            <button
              type="button"
              disabled={phase === "uploading"}
              onClick={() => pickRef.current?.click()}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-hairline-strong bg-tint px-3 py-2.5 text-sm font-medium text-ink/70 transition hover:bg-hairline disabled:opacity-50"
            >
              📁 Choose files
            </button>
          </div>
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <input
            ref={pickRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <p className="mt-2 text-xs text-ink/40">Photos or videos, up to 50 MB each.</p>

          {files.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {files.map((f, i) => (
                <li
                  key={`${f.name}-${i}`}
                  className="flex items-center gap-2.5 rounded-md border border-hairline bg-tint/60 px-2.5 py-1.5"
                >
                  <span className="flex-none text-base">{f.type.startsWith("video/") ? "🎥" : "🖼️"}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-ink/70">{f.name}</span>
                  {phase === "pick" && (
                    <button
                      type="button"
                      onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                      aria-label={`Remove ${f.name}`}
                      className="flex-none text-ink/40 hover:text-crimson"
                    >
                      ✕
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            disabled={files.length === 0 || phase === "uploading"}
            onClick={upload}
            className="mt-5 w-full rounded-md bg-crimson px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-crimson-bright disabled:opacity-50"
          >
            {phase === "uploading"
              ? `Uploading ${progress} of ${files.length}…`
              : `Upload${files.length ? ` ${files.length} file${files.length === 1 ? "" : "s"}` : ""}`}
          </button>
        </>
      )}

      {error && <p className="mt-3 text-sm text-crimson">{error}</p>}
    </div>
  );
}
