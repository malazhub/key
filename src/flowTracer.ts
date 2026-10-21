
  import { randomUUID } from "node:crypto";

export type FlowStatus = "running" | "ok" | "error" | "skipped";

const SAFE_FIELDS = new Set([
  "engine",
  "provider",
  "model",
  "modelId",
  "status",
  "httpStatus",
  "round",
  "attempt",
  "latencyMs",
  "durationMs",
  "inputChars",
  "outputChars",
  "refusalDetected",
  "blocked",
  "retryable",
  "reasonCode",
  "finishReason",
]);

  const getNumber = (...keys: string[]): number | undefined => {
    for (const key of keys) {
      const value = payload[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        return value;
      }
    }
    return undefined;
  };

  const answer = getString("answer", "finalAnswer");
  const achieved = getNumber("achievedAgreement", "actualAgreement");
  const target = getNumber("targetAgreement", "safeTarget");
  const rounds = getNumber("iterationsRequired");
  const summary = getString("consensusSummary");

  const lines = [
    "# Query-to-response trace",
    "",
    "## Original user query",
    "",
    trace.question,
    "",
    "## Processing events",
    "",
    "Events are listed in chronological order.",
    "Payload contents are summarized to keep the trace readable.",
    "Consensus round events show combined batch counts; engine response text is collapsed.",
  ];

  for (const event of trace.events) {
    lines.push(
      "",
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      `### Step ${event.id}: ${event.step}`,
      "",
      `📄 Source file: ${event.sourceFile ?? "Not recorded"}`,
      `⚙️ Function / logic: ${event.sourceFunction ?? "Not recorded"}`,
      `🔵 Incoming: ${
        event.incoming !== undefined
          ? formatFlowValue(event.incoming)
          : "Not recorded"
      }`,
      `🟢 Outgoing: ${
        event.outgoing !== undefined
          ? formatFlowValue(event.outgoing)
          : "Not recorded"
      }`,
      `Status: ${event.status}`,
    );

    if (event.stage) lines.push(`Stage: ${event.stage}`);
    if (event.engine) lines.push(`Engine: ${event.engine}`);
    if (event.round !== undefined) lines.push(`Round: ${event.round}`);
    if (event.attempt !== undefined) lines.push(`Attempt: ${event.attempt}`);
    if (event.reasonCode) lines.push(`Reason code: ${event.reasonCode}`);
    if (event.refusalDetected !== undefined) {
      lines.push(`Refusal detected: ${event.refusalDetected}`);
    }
    if (event.inputChars !== undefined) {
      lines.push(`Input characters: ${event.inputChars}`);
    }
    if (event.outputChars !== undefined) {
      lines.push(`Output characters: ${event.outputChars}`);
    }
    if (event.durationMs !== undefined) {
      lines.push(`Duration: ${event.durationMs} ms`);
    }
    if (event.decision) lines.push(`Decision: ${event.decision}`);
    if (event.detail) lines.push(`Detail: ${event.detail}`);
  }

  lines.push(
    "",
    "## Final agreed response",
    "",
    answer ?? "No final answer was recorded.",
  );

  if (achieved !== undefined) {
    lines.push(
      "",
      `Agreement: ${achieved}%` +
        (target !== undefined ? ` (target ${target}%)` : ""),
    );
  }

  if (rounds !== undefined) {
    lines.push(`Rounds completed: ${rounds}`);
  }

  if (summary) {
    lines.push("", `Consensus: ${summary}`);
  }

  return lines.join("\n");
}
