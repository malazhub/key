/**
 * Browser-side Defender gate for engine-bound requests.
 *
 * The existing src/security/defender.ts remains unchanged; it is a
 * Python adversarial-test harness and cannot be imported by the browser.
 */
const BLOCKED_PATTERNS: RegExp[] = [
  /\bignore\s+(?:all|any|the)\s+(?:previous|prior|above)\s+(?:instructions?|rules?)\b/i,
  /\bdisregard\s+(?:all|any|the)\s+(?:previous|prior|above)\s+(?:instructions?|rules?)\b/i,
  /\breveal\s+(?:the\s+)?(?:system|developer)\s+(?:prompt|instructions?)\b/i,
  /\bshow\s+(?:me\s+)?(?:the\s+)?(?:system|developer)\s+(?:prompt|instructions?)\b/i,
  /\bprint\s+(?:the\s+)?(?:system|developer)\s+(?:prompt|instructions?)\b/i,
];

export function defendQuery(query: string): boolean {
  const normalized = String(query ?? "")
    .normalize("NFKC")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
  if (!normalized) return false;
  return !BLOCKED_PATTERNS.some((pattern) => pattern.test(normalized));
}
