import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Sign-in-free upload links for a single debrief log. The link carries
 * `<logId>.<expiry>.<signature>`; only someone holding a link minted here
 * can add photos/videos, only to that one log, and only until it expires.
 * The signing key is derived from the Supabase service-role key (never
 * exposed to the browser), so there's no extra secret to configure.
 */
const LINK_TTL_SECONDS = 24 * 60 * 60;

function signingKey() {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createHmac("sha256", secret).update("debrief-upload-link").digest();
}

function sign(payload: string) {
  return createHmac("sha256", signingKey()).update(payload).digest("base64url");
}

export function createUploadToken(logId: string) {
  const payload = `${logId}.${Math.floor(Date.now() / 1000) + LINK_TTL_SECONDS}`;
  return `${payload}.${sign(payload)}`;
}

/** The log id the token was minted for, or null if it's forged, malformed, or expired. */
export function verifyUploadToken(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [logId, exp, signature] = parts;
  const expected = Buffer.from(sign(`${logId}.${exp}`));
  const given = Buffer.from(signature);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now() / 1000) return null;
  return logId;
}

/** Public URL of the upload page, on the same host Google Chat calls. */
export function uploadPageUrl(logId: string) {
  const origin = new URL(process.env.GOOGLE_CHAT_AUDIENCE ?? "").origin;
  return `${origin}/debrief/upload/${createUploadToken(logId)}`;
}
