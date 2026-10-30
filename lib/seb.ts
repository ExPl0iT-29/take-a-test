/**
 * SEB sends two headers on every request when configured:
 *   X-SafeExamBrowser-RequestHash    = SHA256(fullUrl + BrowserExamKey)
 *   X-SafeExamBrowser-ConfigKeyHash  = SHA256(fullUrl + ConfigKey)
 *
 * Spec: https://safeexambrowser.org/developer/seb-config-key.html
 *
 * Set SEB_BROWSER_EXAM_KEY in .env.local with the BEK shown in the SEB
 * Configuration Tool's "Exam" tab, and SEB_ENFORCE=true to block non-SEB.
 */

const BEK = process.env.SEB_BROWSER_EXAM_KEY || "";
export const SEB_ENFORCEMENT_ENABLED =
  process.env.SEB_ENFORCE === "true" && BEK.length > 0;

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function verifySebRequest(fullUrl: string, headerHash: string | null): Promise<boolean> {
  if (!SEB_ENFORCEMENT_ENABLED) return true;
  if (!headerHash) return false;
  const expected = await sha256Hex(fullUrl + BEK);
  return expected.toLowerCase() === headerHash.toLowerCase();
}

/**
 * Per-test BEK check (test_secrets.seb_browser_exam_key), independent of
 * the site-wide SEB_ENFORCE flag above. A test with require_seb=true but
 * no key of its own must be denied to everyone, never fall back to a
 * presence-only check on the header.
 */
export async function verifySebRequestWithKey(fullUrl: string, headerHash: string | null, key: string): Promise<boolean> {
  if (!headerHash) return false;
  const expected = await sha256Hex(fullUrl + key);
  return expected.toLowerCase() === headerHash.toLowerCase();
}

/** SEB's hashedQuitPassword is the uppercase SHA256 hex digest of the plaintext exit password. */
export async function sebHashedPassword(plaintext: string): Promise<string> {
  return (await sha256Hex(plaintext)).toUpperCase();
}
