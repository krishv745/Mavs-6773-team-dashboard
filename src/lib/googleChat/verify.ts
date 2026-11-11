import "server-only";
import { createRemoteJWKSet, jwtVerify } from "jose";

// With the Chat app's "Authentication Audience" set to "HTTP endpoint URL",
// every request Google Chat sends carries a Google-signed OIDC ID token whose
// audience is that URL and whose email is Chat's own service account.
const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const CHAT_ISSUER_EMAIL = "chat@system.gserviceaccount.com";

/** True only if the request's bearer token was really issued by Google Chat for this endpoint. */
export async function isFromGoogleChat(request: Request): Promise<boolean> {
  const audience = process.env.GOOGLE_CHAT_AUDIENCE;
  if (!audience) return false;

  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return false;

  try {
    const { payload } = await jwtVerify(token, GOOGLE_JWKS, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience,
    });
    return payload.email === CHAT_ISSUER_EMAIL && payload.email_verified === true;
  } catch {
    return false;
  }
}
