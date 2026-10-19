/**
 * Browser-safe query validation.
 *
 * Keep this module free of Node.js imports and private test configuration:
 * it is used by code that can be bundled into the public GitHub Pages app.
 */
export function assertDefendedQuery(query: unknown): asserts query is string {
  if (typeof query !== "string" || query.trim().length === 0) {
    throw new Error("DEFENDER_BLOCKED: query rejected by defender.");
  }
}
