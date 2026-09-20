"use client";

import { useEffect, useRef, useState } from "react";
import { createClient as createBrowserClient } from "@/lib/supabase/client";

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: unknown) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: unknown) => void) | null;
};

type SpeechResultEvent = {
  results: {
    [i: number]: { 0: { transcript: string }; isFinal: boolean };
    length: number;
  };
};

const ERROR_MESSAGES: Record<string, string> = {
  "not-allowed": "Microphone access is blocked — allow it in your browser's site settings.",
  "service-not-allowed": "Microphone access is blocked — allow it in your browser's site settings.",
  network: "Lost connection while transcribing. Try again.",
  "no-speech": "Didn't catch any speech — try again.",
};

// Uploaded straight from the browser to Supabase Storage (see MediaItem
// below) instead of riding along in the server action's own request body —
// see the comment above MediaItem for why.
const MEDIA_BUCKET = "task-photos";
const MAX_FILE_BYTES = 100 * 1024 * 1024; // 100MB — generous for a phone video clip

type MediaStatus = "uploading" | "done" | "error";
type MediaItem = {
  id: string;
  file: File;
  previewUrl: string | null;
  isVideo: boolean;
  status: MediaStatus;
  url: string | null;
  error: string | null;
};

function isVideoFile(file: File) {
  return file.type.startsWith("video/");
}

/**
 * Merged text + voice + photo/video note fields, shared by the task log form
 * and the general session check-in prompt. Self-contained — reads out via
 * the given field names on form submit, no controlled props needed.
 *
 * Media used to ride along as raw File objects in the surrounding <form>'s
 * own submit, which went through the Next.js server action body-size limit —
 * a couple of phone photos (or one video) routinely blew past it and the
 * whole submit just failed outright. Every file now uploads straight from
 * the browser to Supabase Storage the moment it's picked (the bucket's RLS
 * already allows any authenticated user to write to it — see schema.sql),
 * and only the resulting public URLs (plain text) get submitted with the
 * form via hidden inputs. No binary ever touches the server action.
 */
export default function NoteFields({
  label = "What did you work on?",
  descriptionName = "description",
  photoName = "photo",
  placeholder = "Type, or use the mic above — both land here.",
  showPhoto = true,
  rows = 4,
}: {
  label?: string;
  descriptionName?: string;
  photoName?: string;
  placeholder?: string;
  showPhoto?: boolean;
  rows?: number;
}) {
  const [description, setDescription] = useState("");
  const [items, setItems] = useState<MediaItem[]>([]);
  const [recording, setRecording] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const baseTextRef = useRef("");
  const descriptionRef = useRef("");
  const manualStopRef = useRef(true);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<MediaItem[]>([]);
  itemsRef.current = items;
  // Starts false to match server-rendered output, then flips after mount —
  // checking window.SpeechRecognition during the initial render (even lazily)
  // makes the client's first render disagree with the server's, since this
  // component can be present in the DOM (e.g. inside a closed <dialog>)
  // before any user interaction.
  const [speechSupported, setSpeechSupported] = useState(false);

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    // Client-only browser feature detection; can only run post-mount, which is
    // exactly what avoids the SSR mismatch described above.
    setSpeechSupported(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);

  // Revoke object URLs (previews) on unmount so they don't leak.
  useEffect(() => {
    return () => {
      for (const item of itemsRef.current) {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      }
    };
  }, []);

  // Block the surrounding <form>'s submit while anything is still
  // uploading — otherwise a fast click on the submit button races the
  // upload and can post the log without that photo's URL attached.
  useEffect(() => {
    const form = rootRef.current?.closest("form");
    if (!form) return;
    const onSubmit = (e: SubmitEvent) => {
      if (itemsRef.current.some((i) => i.status === "uploading")) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setMicError(null);
      }
    };
    form.addEventListener("submit", onSubmit, true);
    return () => form.removeEventListener("submit", onSubmit, true);
  }, []);

  function updateDescription(value: string) {
    descriptionRef.current = value;
    setDescription(value);
  }

  async function uploadItem(item: MediaItem) {
    try {
      const supabase = createBrowserClient();
      const ext = item.file.name.split(".").pop() || (item.isVideo ? "mp4" : "jpg");
      const safeExt = ext.replace(/[^a-z0-9]/gi, "").slice(0, 10) || "dat";
      const path = `logs/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`;
      const { error } = await supabase.storage
        .from(MEDIA_BUCKET)
        .upload(path, item.file, { contentType: item.file.type || undefined });
      if (error) throw error;
      const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, status: "done", url: data.publicUrl } : i)),
      );
    } catch (err) {
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? { ...i, status: "error", error: err instanceof Error ? err.message : "Upload failed." }
            : i,
        ),
      );
    }
  }

  function addFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const next: MediaItem[] = [];
    for (const file of Array.from(fileList)) {
      if (file.size > MAX_FILE_BYTES) {
        next.push({
          id: `${Date.now()}-${Math.random()}`,
          file,
          previewUrl: null,
          isVideo: isVideoFile(file),
          status: "error",
          url: null,
          error: "Too large (max 100MB).",
        });
        continue;
      }
      const isVideo = isVideoFile(file);
      next.push({
        id: `${Date.now()}-${Math.random()}`,
        file,
        previewUrl: isVideo ? null : URL.createObjectURL(file),
        isVideo,
        status: "uploading",
        url: null,
        error: null,
      });
    }
    setItems((prev) => [...prev, ...next]);
    for (const item of next) {
      if (item.status === "uploading") void uploadItem(item);
    }
  }

  function retry(item: MediaItem) {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: "uploading", error: null } : i)));
    void uploadItem(item);
  }

  function remove(item: MediaItem) {
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    setItems((prev) => prev.filter((i) => i.id !== item.id));
  }

  function toggleRecording() {
    if (recording) {
      manualStopRef.current = true;
      recognitionRef.current?.stop();
      setRecording(false);
      return;
    }

    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const SpeechRecognitionCtor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) return;

    setMicError(null);
    // Whatever's already typed stays put — new speech gets appended to it,
    // not to whatever the last onresult event happened to contain.
    baseTextRef.current = descriptionRef.current;

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (event: unknown) => {
      // `results` accumulates for the whole session, so this rebuilds the
      // full final transcript from scratch each time instead of appending
      // onto itself — appending here was double/triple-counting text.
      const e = event as SpeechResultEvent;
      let final = "";
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript + " ";
      }
      updateDescription(`${baseTextRef.current} ${final}`.trim());
    };
    recognition.onerror = (event: unknown) => {
      const code = (event as { error?: string })?.error;
      manualStopRef.current = true;
      setMicError(code && ERROR_MESSAGES[code] ? ERROR_MESSAGES[code] : "Voice recording stopped unexpectedly.");
      setRecording(false);
    };
    recognition.onend = () => {
      if (manualStopRef.current) {
        setRecording(false);
        return;
      }
      // The browser auto-stopped (Chrome does this after a few seconds of
      // silence, even in "continuous" mode) — fold what's transcribed so
      // far into the base text and pick back up automatically, instead of
      // silently dropping the rest of what gets said.
      baseTextRef.current = descriptionRef.current;
      try {
        recognition.start();
      } catch {
        setRecording(false);
      }
    };

    manualStopRef.current = false;
    recognitionRef.current = recognition;
    recognition.start();
    setRecording(true);
  }

  const uploadingCount = items.filter((i) => i.status === "uploading").length;

  return (
    <div ref={rootRef}>
      <div>
        <div className="flex items-center justify-between">
          <label htmlFor={descriptionName} className="text-sm font-medium text-ink/80">
            {label}
          </label>
          {speechSupported && (
            <button
              type="button"
              onClick={toggleRecording}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                recording ? "bg-crimson/10 text-crimson" : "text-ink/60 hover:bg-tint"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${recording ? "animate-pulse bg-crimson" : "bg-ink/30"}`} />
              {recording ? "Stop recording" : "🎤 Voice note"}
            </button>
          )}
        </div>
        <textarea
          id={descriptionName}
          name={descriptionName}
          rows={rows}
          value={description}
          onChange={(e) => updateDescription(e.target.value)}
          placeholder={placeholder}
          className="mt-1.5 w-full rounded-md border border-hairline-strong px-3 py-2.5 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/10"
        />
        {micError && <p className="mt-1.5 text-xs text-crimson">{micError}</p>}
        {!speechSupported && (
          <p className="mt-1.5 text-xs text-ink/40">
            Voice notes need Chrome or Edge over HTTPS — not supported in this browser.
          </p>
        )}
      </div>

      {showPhoto && (
        <div className="mt-4">
          <label className="text-sm font-medium text-ink/80">Photos &amp; videos (optional)</label>

          <div className="mt-1.5 flex gap-2">
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-hairline-strong bg-tint px-3 py-2 text-sm font-medium text-ink/70 transition hover:bg-hairline"
            >
              📷 Take photo
            </button>
            <button
              type="button"
              onClick={() => uploadInputRef.current?.click()}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-hairline-strong bg-tint px-3 py-2 text-sm font-medium text-ink/70 transition hover:bg-hairline"
            >
              📁 Upload files
            </button>
          </div>
          {/* Camera capture — one shot per tap on most phones; tap again for more. */}
          <input
            ref={cameraInputRef}
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
          {/* Picking from the file system/gallery — photos and videos, any number. */}
          <input
            ref={uploadInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />

          {items.length > 0 && (
            <ul className="mt-2.5 space-y-1.5">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-2.5 rounded-md border border-hairline bg-tint/60 px-2.5 py-1.5"
                >
                  {item.status === "done" && (
                    <input type="hidden" name={photoName} value={item.url ?? ""} />
                  )}
                  {item.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- local blob: preview, not a remote asset
                    <img
                      src={item.previewUrl}
                      alt=""
                      className="h-9 w-9 flex-none rounded object-cover"
                    />
                  ) : (
                    <span className="flex h-9 w-9 flex-none items-center justify-center rounded bg-hairline-strong text-base">
                      {item.isVideo ? "🎥" : "📄"}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-xs text-ink/70">{item.file.name}</span>
                  {item.status === "uploading" && (
                    <span className="flex-none text-xs text-ink/40">Uploading…</span>
                  )}
                  {item.status === "error" && (
                    <>
                      <span className="flex-none text-xs text-crimson">{item.error}</span>
                      <button
                        type="button"
                        onClick={() => retry(item)}
                        className="flex-none text-xs font-semibold text-navy hover:underline"
                      >
                        Retry
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => remove(item)}
                    aria-label={`Remove ${item.file.name}`}
                    className="flex-none text-ink/40 hover:text-crimson"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
          {uploadingCount > 0 && (
            <p className="mt-1.5 text-xs text-ink/40">
              Uploading {uploadingCount} file{uploadingCount === 1 ? "" : "s"}…
            </p>
          )}
        </div>
      )}
    </div>
  );
}
