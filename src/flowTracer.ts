
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
  "selectedEngineCount",
  "successfulEngineResponses",
  "failedEngineResponses",
  "batchProduced",
  "batchAgreement",
  "targetAgreement",
  "agreementTargetMet",
  "independentVerificationPassed",
  "conformityReached",
  "verificationStatus",
  "missingRequirementCount",
  "groundingSourceCount",
  "plannerCandidateCount",
  "selectedEvidenceCount",
  "contextMode",
  "strictQueryPriority",
  "iterationsRequired",
  "achievedAgreement",
  "activeModelCount",
  "answerChars",
]);

function formatFlowValue(value: unknown): string {
  if (value === undefined) return "Not recorded";
  if (value === null) return "No data";

  if (typeof value === "string") {
    return `Text payload: ${value.length} chars; content collapsed`;
  }

  if (Array.isArray(value)) {
    return `Array payload: ${value.length} item(s); content collapsed`;
  }

  if (typeof value !== "object") {
    return String(value).slice(0, 100);
  }

  const data = value as Record<string, unknown>;
  const details = Object.entries(data)
    .filter(([key, item]) =>
      SAFE_FIELDS.has(key) &&
      (typeof item === "string" ||
        typeof item === "number" ||
        typeof item === "boolean"),
    )
    .map(([key, item]) => `${key}=${String(item).slice(0, 80)}`);

  return details.length > 0
    ? `${details.join("; ")}; other payload fields collapsed`
    : `Structured payload: ${Object.keys(data).length} field(s); content collapsed`;
}
    

export interface FlowEvent {
  id: number;
  step: string;
  status: FlowStatus;
  at: string;
  sourceFile?: string;
  sourceFunction?: string;
  durationMs?: number;
  detail?: string;
  incoming?: unknown;
  outgoing?: unknown;
  decision?: string;

  stage?: string;
  engine?: string;
  round?: number;
  attempt?: number;
  reasonCode?: string;
  refusalDetected?: boolean;
  inputChars?: number;
  outputChars?: number;
}



export interface FlowStepData {
  sourceFile?: string;
  sourceFunction?: string;
  incoming?: unknown;
  outgoing?: unknown;
  decision?: string;
  detail?: string;
  durationMs?: number;

  stage?: string;
  engine?: string;
  round?: number;
  attempt?: number;
  reasonCode?: string;
  refusalDetected?: boolean;
  inputChars?: number;
  outputChars?: number;
}


export function recordFlowStep(
  traceId: string,
  step: string,
  status: FlowStatus,
  data: FlowStepData,
): void {
  const trace = traces.get(traceId);
  if (!trace) return;

    trace.events.push({
    id: trace.events.length + 1,
    step,
    status,
    at: new Date().toISOString(),
    ...(data.sourceFile === undefined
      ? {}
      : { sourceFile: data.sourceFile }),
    ...(data.sourceFunction === undefined
      ? {}
      : { sourceFunction: data.sourceFunction }),
    ...(data.durationMs === undefined
      ? {}
      : { durationMs: data.durationMs }),
    ...(data.detail === undefined ? {} : { detail: data.detail }),
    ...(data.incoming === undefined
      ? {}
      : { incoming: structuredClone(data.incoming) }),
    ...(data.outgoing === undefined
      ? {}
      : { outgoing: structuredClone(data.outgoing) }),
    ...(data.decision === undefined
      ? {}
      : { decision: data.decision }),
    ...(data.stage === undefined ? {} : { stage: data.stage }),
    ...(data.engine === undefined ? {} : { engine: data.engine }),
    ...(data.round === undefined ? {} : { round: data.round }),
    ...(data.attempt === undefined ? {} : { attempt: data.attempt }),
    ...(data.reasonCode === undefined
      ? {}
      : { reasonCode: data.reasonCode }),
    ...(data.refusalDetected === undefined
      ? {}
      : { refusalDetected: data.refusalDetected }),
    ...(data.inputChars === undefined
      ? {}
      : { inputChars: data.inputChars }),
    ...(data.outputChars === undefined
      ? {}
      : { outputChars: data.outputChars }),
  });
}


export interface FlowTrace {
  id: string;
  question: string;
  startedAt: string;
  finishedAt?: string;
  status: FlowStatus;
  events: FlowEvent[];
}

const MAX_TRACES = 30;
const traces = new Map<string, FlowTrace>();
let latestCompletedTraceId: string | undefined;

export function startFlowTrace(question = ""): string {
  const id = randomUUID();

  traces.set(id, {
    id,
    question: question.slice(0, 2000),
    startedAt: new Date().toISOString(),
    status: "running",
    events: [],
  });

  while (traces.size > MAX_TRACES) {
    const oldestId = traces.keys().next().value;
    if (!oldestId) break;
    traces.delete(oldestId);
  }

  return id;
}

export function recordFlowEvent(
  traceId: string,
  step: string,
  status: FlowStatus,
  detail?: string,
  durationMs?: number,
): void {
  const trace = traces.get(traceId);
  if (!trace) return;

  trace.events.push({
    id: trace.events.length + 1,
    step,
    status,
    at: new Date().toISOString(),
    ...(durationMs === undefined ? {} : { durationMs }),
    ...(detail ? { detail: detail.slice(0, 240) } : {}),
  });
}

export function finishFlowTrace(
  traceId: string,
  status: "ok" | "error",
): void {
  const trace = traces.get(traceId);
  if (!trace) return;

  trace.status = status;
  trace.finishedAt = new Date().toISOString();
  latestCompletedTraceId = traceId;
}

export function getLatestFlowTrace(): FlowTrace | undefined {
  const trace = latestCompletedTraceId
    ? traces.get(latestCompletedTraceId)
    : undefined;

  return trace ? structuredClone(trace) : undefined;
}

export function formatFlowTrace(trace: FlowTrace | undefined): string {
  if (!trace) {
    return [
      "# Query-to-response trace",
      "",
      "No previous query trace was found.",
      "",
      "Send a normal message first, then type: show trace.",
    ].join("\n");
  }

  const finalEvent = [...trace.events]
    .reverse()
    .find((event) => /final response assembly/i.test(event.step));

  const rawOutgoing =
    finalEvent?.outgoing &&
    typeof finalEvent.outgoing === "object"
      ? (finalEvent.outgoing as Record<string, unknown>)
      : {};

  const nested =
    rawOutgoing.consensusResult &&
    typeof rawOutgoing.consensusResult === "object"
      ? (rawOutgoing.consensusResult as Record<string, unknown>)
      : undefined;

  const payload: Record<string, unknown> = {
    ...(nested ?? {}),
    ...rawOutgoing,
    answer:
      typeof nested?.finalAnswer === "string"
        ? nested.finalAnswer
        : typeof nested?.answer === "string"
          ? nested.answer
          : typeof rawOutgoing.answer === "string"
            ? rawOutgoing.answer
            : undefined,
  };

  const getString = (...keys: string[]): string | undefined => {
    for (const key of keys) {
      const value = payload[key];
      if (typeof value === "string" && value.trim()) {
        return value;
      }
    }
    return undefined;
  };

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
  ];

  // Render each consensus round as one combined block, rather than exposing
  // every internal round event as a separate trace step.
  const displayEvents: FlowEvent[] = [];
  const roundGroups = new Map<number, FlowEvent[]>();
  for (const event of trace.events) {
    if (
      event.round !== undefined &&
      (event.stage === "consensus_round" ||
        event.stage === "conformity_verification")
    ) {
      const group = roundGroups.get(event.round) ?? [];
      group.push(event);
      roundGroups.set(event.round, group);
      continue;
    }
    displayEvents.push(event);
  }

  for (const [round, events] of roundGroups) {
    const incoming: Record<string, unknown> = {};
    const outgoing: Record<string, unknown> = {};
    for (const event of events) {
      if (event.incoming && typeof event.incoming === "object") {
        Object.assign(incoming, event.incoming);
      }
      if (event.outgoing && typeof event.outgoing === "object") {
        Object.assign(outgoing, event.outgoing);
      }
    }
    const first = events[0];
    const failed = events.some((event) => event.status === "error");
    const running = events.some((event) => event.status === "running");
    displayEvents.push({
      id: first.id,
      step: `Consensus round ${round}: combined engine results and verification`,
      status: failed ? "error" : running ? "running" : "ok",
      at: first.at,
      sourceFile: "src/consensusEngine.ts",
      sourceFunction: "runSmartMemoryConsensusLoop",
      stage: "consensus_round_summary",
      round,
      incoming,
      outgoing,
      durationMs: events.reduce((sum, event) => sum + (event.durationMs ?? 0), 0) || undefined,
      decision: events.map((event) => event.decision).filter(Boolean).join(" "),
      detail: events.map((event) => event.detail).filter(Boolean).join(" | ").slice(0, 240) || undefined,
    });
  }
  displayEvents.sort((a, b) => a.id - b.id);

  for (const event of displayEvents) {
    lines.push(
      "",
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      `### Step ${event.id}: ${event.step}`,
      "",
      `📄 Source file: ${event.sourceFile ?? "Not recorded"}`,
      `⚙️ Function / logic: ${event.sourceFunction ?? "Not recorded"}`,
      `🔵 Incoming: ${event.incoming !== undefined ? formatFlowValue(event.incoming) : "Not recorded"}`,
      `🟢 Outgoing: ${event.outgoing !== undefined ? formatFlowValue(event.outgoing) : "Not recorded"}`,
      `Status: ${event.status}`,
    );

    if (event.stage) lines.push(`Stage: ${event.stage}`);
    if (event.engine) lines.push(`Engine: ${event.engine}`);
    if (event.round !== undefined) lines.push(`Round: ${event.round}`);
    if (event.attempt !== undefined) lines.push(`Attempt: ${event.attempt}`);
    if (event.reasonCode) lines.push(`Reason code: ${event.reasonCode}`);
    if (event.refusalDetected !== undefined) lines.push(`Refusal detected: ${event.refusalDetected}`);
    if (event.inputChars !== undefined) lines.push(`Input characters: ${event.inputChars}`);
    if (event.outputChars !== undefined) lines.push(`Output characters: ${event.outputChars}`);
    if (event.durationMs !== undefined) lines.push(`Duration: ${event.durationMs} ms`);
    if (event.decision) lines.push(`Decision: ${event.decision.slice(0, 240)}`);
    if (event.detail) lines.push(`Detail: ${event.detail.slice(0, 240)}`);
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
