
 // src/upgrades/intentRouter.ts

import { assertDefendedQuery } from "../security/queryGuard";

export type Intent =
  | { type: "question"; text: string }
  | { type: "self_upgrade"; instruction: string; rounds: number };

const DEFAULT_UPGRADE_INSTRUCTION =
  "Inspect the codebase, identify the highest-priority reproducible bug or improvement, make a focused and safe change, run relevant tests and the production build, and deploy only if all required checks pass. Verify results using actual evidence. Never claim success without evidence. Do not modify unrelated files.";

const MAX_UPGRADE_ROUNDS = 50;

function createSelfUpgradeIntent(
  instruction: string,
  rounds = 1,
): Intent {
  const normalizedInstruction = instruction.trim();

  if (!normalizedInstruction) {
    throw new Error("Provide an instruction after /upgrade.");
  }

  if (
    !Number.isSafeInteger(rounds) ||
    rounds < 1 ||
    rounds > MAX_UPGRADE_ROUNDS
  ) {
    throw new Error(
      `Upgrade rounds must be between 1 and ${MAX_UPGRADE_ROUNDS}.`,
    );
  }

  return {
    type: "self_upgrade",
    instruction: normalizedInstruction,
    rounds,
  };
}

function parseRoundsOption(
  args: string,
): { rounds: number; instruction: string } {
  const match = args.match(
    /^--rounds(?:=|\s+)(\S+)(?:\s+([\s\S]*))?$/i,
  );

  if (!match || !/^\d+$/.test(match[1])) {
    throw new Error(
      `Use --rounds=N with an integer from 1 to ${MAX_UPGRADE_ROUNDS}.`,
    );
  }

  const rounds = Number(match[1]);

  if (
    !Number.isSafeInteger(rounds) ||
    rounds < 1 ||
    rounds > MAX_UPGRADE_ROUNDS
  ) {
    throw new Error(
      `Upgrade rounds must be between 1 and ${MAX_UPGRADE_ROUNDS}.`,
    );
  }

  const instruction = (match[2] ?? "").trim();

  if (!instruction) {
    throw new Error("Provide an instruction after /upgrade --rounds=N.");
  }

  return { rounds, instruction };
}

export function routeIntent(message: string): Intent {
  assertDefendedQuery(message);

  const text = message.trim();

  if (!text) {
    return { type: "question", text: "" };
  }

  // Bare upgrade commands use the default instruction.
  if (/^(?:\/)?upgrade[.!]?$/i.test(text)) {
    return createSelfUpgradeIntent(DEFAULT_UPGRADE_INSTRUCTION);
  }

  // Only explicit /upgrade commands receive special routing.
  // GitHub URLs, /edit-ui, and ordinary messages remain normal queries.
  if (/^\/upgrade(?:\s|$)/i.test(text)) {
    const args = text.replace(/^\/upgrade\b/i, "").trim();

    if (!args) {
      return createSelfUpgradeIntent(DEFAULT_UPGRADE_INSTRUCTION);
    }

    if (/^--rounds(?:=|\s|$)/i.test(args)) {
      const parsed = parseRoundsOption(args);
      return createSelfUpgradeIntent(
        parsed.instruction,
        parsed.rounds,
      );
    }

    return createSelfUpgradeIntent(args);
  }

  return { type: "question", text };
}
