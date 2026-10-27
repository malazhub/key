export type RefusalCategory =
  | "explicit_refusal"
  | "capability_limitation"
  | "policy_reference"
  | "none";

export interface RefusalAnalysis {
  refused: boolean;
  categories: RefusalCategory[];
  matchedPatterns: string[];
}


const REFUSAL_PATTERNS: Array<{
  category: Exclude<RefusalCategory, "none">;
  pattern: RegExp;
}> = [
  {
    category: "explicit_refusal",
    pattern:
      /\b(?:i|we)\s+(?:cannot|can't|won't|will not|am unable to|must decline|must refuse)\s+(?:help|assist|provide|share|give|create|generate|answer|fulfill|comply with)\b/i,
  },
  {
    category: "capability_limitation",
    pattern:
      /\b(?:i|we)\s+(?:do not|don't)\s+have access to\b|\b(?:i|we)\s+(?:cannot|can't|am unable to)\s+(?:access|retrieve|open|browse)\b/i,
  },
  {
    category: "policy_reference",
    pattern:
      /\b(?:i|we)\s+(?:cannot|can't|won't|will not)\s+(?:help|assist|provide|share|give|create|generate|answer|fulfill)\b.{0,160}\b(?:safety|policy|policies|guidelines|restricted|harmful|moderation)\b/i,
  },
];


export function analyzeRefusal(response: string): RefusalAnalysis {
  const categories: RefusalCategory[] = [];
  const matchedPatterns: string[] = [];

  for (const { category, pattern } of REFUSAL_PATTERNS) {
    if (pattern.test(response)) {
      if (!categories.includes(category)) categories.push(category);
      matchedPatterns.push(pattern.source);
    }
  }

  return {
    refused: categories.length > 0,
    categories: categories.length > 0 ? categories : ["none"],
    matchedPatterns,
  };
}

export function defendQuery(query: string): boolean {
  return typeof query === "string" && query.trim().length > 0;
}

export function assertDefendedQuery(
  query: unknown,
): asserts query is string {
  if (typeof query !== "string" || query.trim().length === 0) {
    throw new Error("DEFENDER_BLOCKED: query rejected by defender.");
  }

  if (!defendQuery(query)) {
    throw new Error("DEFENDER_BLOCKED: query rejected by defender.");
  }
}
