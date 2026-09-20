const VIDEO_EXTENSIONS = new Set([
  "mp4",
  "mov",
  "webm",
  "avi",
  "mkv",
  "m4v",
  "3gp",
  "3gpp",
  "ogv",
]);

/**
 * Task log attachments (see NoteFields) can now be photos or videos, both
 * uploaded to the same Storage bucket and stored as plain URLs — this is
 * the one place that decides which `<img>`/`<video>` tag to render for a
 * given attachment, by its file extension.
 */
export function isVideoUrl(url: string): boolean {
  const path = url.split(/[?#]/)[0];
  const ext = path.split(".").pop()?.toLowerCase();
  return Boolean(ext && VIDEO_EXTENSIONS.has(ext));
}
