// src/upgrades/intentRouter.ts

import { assertDefendedQuery } from "../security/queryGuard";
export type Intent =
  | { type: "question"; text: string }
  | { type: "chat"; text: string }
  | { type: "ui_edit"; instruction: string }
  | { type: "self_upgrade"; instruction: string; rounds: number };

const DEFAULT_UPGRADE_INSTRUCTION =
  "Inspect the codebase, identify the highest-priority reproducible bug or improvement, make a focused and safe change, run relevant tests and the production build, and deploy only if all required checks pass. Verify results using actual evidence. Never claim success without evidence. Do not modify unrelated files.";

export function routeIntent(message: string): Intent {
  assertDefendedQuery(message);

  const text = message.trim();

  if (!text) {
    return { type: "chat", text: "" };
  }

  // Bare "upgrade", "upgrade!", "/upgrade", or "/upgrade!"
  if (/^(?:\/)?upgrade[.!]?$/i.test(text)) {
    return {
      type: "self_upgrade",
      instruction: DEFAULT_UPGRADE_INSTRUCTION,
      rounds: 1,
    };
  }

  // PURPOSE: Do not divert non-upgrade messages into a separate UI-edit route.
// Treat /edit-ui and all other non-upgrade input as normal query text.

  // /upgrade <instruction> with optional --rounds=N
  const upgradeMatch = text.match(
    /^\/upgrade(?:\s+--rounds=(\d+))?\s+([\s\S]+)$/i
  );
  if (upgradeMatch) {
    const rounds = upgradeMatch[1] ? Number(upgradeMatch[1]) : 1;
    const instruction = upgradeMatch[2].trim();
    if (!Number.isInteger(rounds) || rounds < 1 || rounds > 50) {
      throw new Error("Upgrade rounds must be between 1 and 50.");
    }
    if (!instruction) {
      throw new Error("Provide an instruction after /upgrade.");
    }
    return { type: "self_upgrade", instruction, rounds };
  }

  // PURPOSE: Route every non-upgrade message as ordinary user input.
// Do not classify URLs, GitHub repositories, file trees, or UI-edit
// requests as separate commands.
return { type: "question", text };
}
