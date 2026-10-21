export const PLACEHOLDER_EMAIL_DOMAIN = "@members.mavericks6773.app";
export const USERNAME_PATTERN = /^[a-zA-Z0-9_.]+$/;
// Middleware's cached role / must_reset_password lookup. Anything that
// changes those for the current user must clear it, or the middleware keeps
// routing on the stale value until it expires.
export const ROLE_CACHE_COOKIE = "tt_role_cache";
