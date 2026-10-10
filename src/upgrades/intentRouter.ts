// src/upgrades/intentRouter.ts
export type Intent =
  | { type: "question"; text: string }
  | { type: "chat"; text: string }
  | { type: "ui_edit"; instruction: string }
  | { type: "self_upgrade"; instruction: string; rounds: number };

export function routeIntent(message: string): Intent {
  const trimmed = message.trim();

  if (/^\/edit-ui\s*$/i.test(trimmed)) {
    throw new Error("Provide an instruction after /edit-ui.");
  }
  if (/^\/upgrade(?:\s+--rounds=\d+)?\s*$/i.test(trimmed)) {
    throw new Error("Provide an instruction after /upgrade.");
  }

  const uiEditMatch = trimmed.match(/^\/edit-ui\s+([\s\S]+)$/i);
  if (uiEditMatch) {
    const instruction = uiEditMatch[1].trim();
    if (!instruction) {
      throw new Error("Provide an instruction after /edit-ui.");
    }
    return { type: "ui_edit", instruction };
  }

  const upgradeMatch = trimmed.match(
    /^\/upgrade(?:\s+--rounds=(\d+))?\s+([\s\S]+)$/i
  );
  if (upgradeMatch) {
    const requestedRounds = upgradeMatch[1]
      ? Number(upgradeMatch[1])
      : 50;
    const instruction = upgradeMatch[2].trim();
    if (
      !Number.isInteger(requestedRounds) ||
      requestedRounds < 1 ||
      requestedRounds > 50
    ) {
      throw new Error("Upgrade rounds must be an integer from 1 to 50.");
    }
    if (!instruction) {
      throw new Error("Provide an instruction after /upgrade.");
    }
    return { type: "self_upgrade", instruction, rounds: requestedRounds };
  }

  const isQuestion =
    /^(how|what|why|when|where|who|which|can|does|is|are|explain|tell me)\b/i.test(
      trimmed
    ) || trimmed.endsWith("?");

  if (isQuestion) return { type: "question", text: trimmed };
  return { type: "chat", text: trimmed };
}
