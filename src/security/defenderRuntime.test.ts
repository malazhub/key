import { describe, expect, it } from "vitest";
import {
  assertDefendedQuery,
  defendQuery,
} from "./defenderRuntime";

describe("defendQuery", () => {
  it("accepts a non-empty query", () => {
    expect(defendQuery("Explain gravity")).toBe(true);
  });

  it("rejects an empty query", () => {
    expect(defendQuery("")).toBe(false);
  });

  it("rejects whitespace-only input", () => {
    expect(defendQuery("   ")).toBe(false);
  });
});

describe("assertDefendedQuery", () => {
  it("accepts a non-empty string", () => {
    expect(() => {
      assertDefendedQuery("Explain gravity");
    }).not.toThrow();
  });

  it.each([
    "",
    "   ",
    null,
    undefined,
    123,
    {},
  ])("rejects invalid input: %j", (input) => {
    expect(() => {
      assertDefendedQuery(input);
    }).toThrow("DEFENDER_BLOCKED");
  });
});
