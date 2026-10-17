
import assert from "node:assert/strict";
import {
  assertDefendedQuery,
  defendQuery,
} from "./defenderRuntime";

assert.equal(defendQuery("Explain gravity"), true);
assert.equal(defendQuery(""), false);
assert.equal(defendQuery("   "), false);

assert.doesNotThrow(() => {
  assertDefendedQuery("Explain gravity");
});

const invalidInputs: unknown[] = [
  "",
  "   ",
  null,
  undefined,
  123,
  {},
];

for (const input of invalidInputs) {
  assert.throws(
    () => assertDefendedQuery(input),
    /DEFENDER_BLOCKED/,
    `Expected invalid input to be rejected: ${String(input)}`,
  );
}

console.log("defenderRuntime tests passed");
