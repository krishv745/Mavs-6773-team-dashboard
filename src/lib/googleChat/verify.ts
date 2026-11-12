import "server-only";
import { createRemoteJWKSet, jwtVerify } from "jose";

// The Chat app is built as a Google Workspace add-on (Google no longer lets
// new Chat apps opt out). Every request carries a Google-signed OIDC ID token
// whose audience is the HTTP endpoint URL and whose email is the add-on's own
// service account: service-<project number>@gcp-sa-gsuiteaddons.iam.gserviceaccount.com
// (shown in Chat API → Configuration as "Service Account Email").
const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

/** True only if the request's bearer token was really issued by our Chat add-on for this endpoint. */
export async function isFromGoogleChat(request: Request): Promise<boolean> {
  const audience = process.env.GOOGLE_CHAT_AUDIENCE;
  const projectNumber = process.env.GOOGLE_CHAT_PROJECT_NUMBER?.trim();
  if (!audience || !projectNumber) {
    console.error("[google-chat] GOOGLE_CHAT_AUDIENCE or GOOGLE_CHAT_PROJECT_NUMBER is not set");
    return false;
  }

  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return false;

  try {
    const { payload } = await jwtVerify(token, GOOGLE_JWKS, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience,
    });
    const expected = `service-${projectNumber}@gcp-sa-gsuiteaddons.iam.gserviceaccount.com`;
    if (payload.email !== expected || payload.email_verified !== true) {
      console.error(`[google-chat] token email ${String(payload.email)} is not ${expected}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[google-chat] token rejected:", (err as Error).message);
    return false;
  }
}
