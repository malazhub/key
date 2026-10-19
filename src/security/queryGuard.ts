export function defendQuery(query: string): boolean {
  return typeof query === "string" &&
    query.trim().length > 0;
}

export function assertDefendedQuery(
  query: unknown,
): asserts query is string {
  if (
    typeof query !== "string" ||
    query.trim().length === 0
  ) {
    throw new Error(
      "DEFENDER_BLOCKED: query rejected by defender."
    );
  }
}
