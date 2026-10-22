
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
    
function normalizeTraceStep(value: string): string {
  const step = String(value || "").replace(/\s+/g, " ").trim();
  return step.slice(0, 160) || "Unnamed step";
}

function normalizeTraceFunction(
  value: string | undefined,
): string | undefined {
  if (!value) return undefined;

  const name = value.trim();

  return /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(name)
    ? name
    : undefined;
}

function sanitizeTracePayload(value: unknown): unknown {
  if (value === undefined || value === null) return value;

  if (typeof value === "string") {
    return { type: "text", chars: value.length };
  }

  if (Array.isArray(value)) {
    return { type: "array", items: value.length };
  }

  if (typeof value !== "object") {
    return value;
  }

  const data = value as Record<string, unknown>;
  const safeData: Record<string, unknown> = {};

  for (const [key, item] of Object.entries(data)) {
    if (
      SAFE_FIELDS.has(key) &&
      (typeof item === "string" ||
        typeof item === "number" ||
        typeof item === "boolean")
    ) {
      safeData[key] =
        typeof item === "string" ? item.slice(0, 80) : item;
    }
  }

  return Object.keys(safeData).length > 0
    ? safeData
    : { type: "object", fieldCount: Object.keys(data).length };
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

  const incoming = sanitizeTracePayload(data.incoming);
  const outgoing = sanitizeTracePayload(data.outgoing);

  const sourceFile =
    data.sourceFile &&
    /^src\/[A-Za-z0-9_./-]+\.tsx?$/.test(data.sourceFile)
      ? data.sourceFile
      : undefined;

  const sourceFunction = normalizeTraceFunction(data.sourceFunction);

  trace.events.push({
    id: trace.events.length + 1,
    step: normalizeTraceStep(step),
    status,
    at: new Date().toISOString(),
    ...(sourceFile ? { sourceFile } : {}),
    ...(sourceFunction ? { sourceFunction } : {}),
    ...(typeof data.durationMs === "number" &&
    Number.isFinite(data.durationMs)
      ? { durationMs: data.durationMs }
      : {}),
    ...(incoming ? { incoming } : {}),
    ...(outgoing ? { outgoing } : {}),
    ...(typeof data.round === "number" &&
    Number.isFinite(data.round)
      ? { round: data.round }
      : {}),
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

export function startFlowTrace(_question = ""): string {
  const id = randomUUID();

  traces.set(id, {
    id,
    question: "[redacted]",
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
  _detail?: string,
  durationMs?: number,
): void {
  const trace = traces.get(traceId);
  if (!trace) return;

  trace.events.push({
    id: trace.events.length + 1,
    step: normalizeTraceStep(step),
    status,
    at: new Date().toISOString(),
    ...(typeof durationMs === "number" &&
    Number.isFinite(durationMs)
      ? { durationMs }
      : {}),
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

      export function formatFlowTrace(trace: FlowTrace | undefined): string {
  if (!trace) {
    return [
      "# Step Tracer",
      "",
      "| Step | Status | Source | Metrics |",
      "|---|---|---|---|",
      "| Request routing | unavailable | unavailable | — |",
      "| Combined processing | unavailable | unavailable | — |",
      "| Final response assembly | unavailable | unavailable | — |",
    ].join("\n");
  }

  const events = trace.events;

  const findEvent = (pattern: RegExp) =>
    [...events].reverse().find((event) => pattern.test(event.step));

  const requestEvent =
    events.find((event) => /query accepted by engine router/i.test(event.step)) ??
    events.find((event) => /request/i.test(event.step));

  const processingEvent =
    findEvent(/combined engine batch|agreement and verification|consensus loop entered/i);

  const finalEvent = findEvent(/final response assembly/i);

  const source = (event: FlowEvent | undefined) => {
    if (!event?.sourceFile || !event.sourceFunction) {
      return "unavailable";
    }

    return `${event.sourceFile} — ${event.sourceFunction}()`;
  };

  const status = (event: FlowEvent | undefined) =>
    event?.status ?? "unavailable";

  const maxRound = events.reduce(
    (highest, event) => Math.max(highest, event.round ?? 0),
    0,
  );

  const finalOutgoing =
    finalEvent?.outgoing && typeof finalEvent.outgoing === "object"
      ? finalEvent.outgoing as Record<string, unknown>
      : {};

  const metricFields = [
    "selectedEngineCount",
    "successfulEngineResponses",
    "failedEngineResponses",
    "achievedAgreement",
    "targetAgreement",
    "iterationsRequired",
    "activeModelCount",
  ];

  const metrics = (event: FlowEvent | undefined) => {
    if (!event) return "—";

    const payloads = [
      event.incoming,
      event.outgoing,
    ].filter(
      (value): value is Record<string, unknown> =>
        Boolean(value) && typeof value === "object" && !Array.isArray(value),
    );

    const entries = metricFields.flatMap((key) => {
      const value = [...payloads]
        .reverse()
        .map((payload) => payload[key])
        .find(
          (item) =>
            typeof item === "number" && Number.isFinite(item),
        );

      return value === undefined ? [] : [`${key}: ${value}`];
    });

    return entries.length ? entries.join(", ") : "—";
  };

  const processingMetrics = [
    ...(maxRound > 0 ? [`rounds: ${maxRound}`] : []),
    metrics(processingEvent) === "—" ? "" : metrics(processingEvent),
  ].filter(Boolean).join(", ") || "—";

  const finalMetrics = metricFields.flatMap((key) => {
    const value = finalOutgoing[key];
    return typeof value === "number" && Number.isFinite(value)
      ? [`${key}: ${value}`]
      : [];
  }).join(", ") || "—";

  const rows = [
    `| Request routing | ${status(requestEvent)} | ${source(requestEvent)} | ${metrics(requestEvent)} |`,
    `| Combined processing | ${status(processingEvent)} | ${source(processingEvent)} | ${processingMetrics} |`,
    `| Final response assembly | ${status(finalEvent)} | ${source(finalEvent)} | ${finalMetrics} |`,
  ];

  return [
    "# Step Tracer",
    "",
    "| Step | Status | Source | Metrics |",
    "|---|---|---|---|",
    ...rows,
  ].join("\n");
}
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

    if (event.stage) {
      lines.push(`Stage: ${event.stage}`);
    }

    if (event.engine) {
      lines.push(`Engine: ${event.engine}`);
    }

    if (event.round !== undefined) {
      lines.push(`Round: ${event.round}`);
    }

    if (event.attempt !== undefined) {
      lines.push(`Attempt: ${event.attempt}`);
    }

    if (event.reasonCode) {
      lines.push(`Reason code: ${event.reasonCode}`);
    }

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

    if (event.decision) {
      lines.push(`Decision: ${event.decision}`);
    }

    if (event.detail) {
      lines.push(`Detail: ${event.detail}`);
    }
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
