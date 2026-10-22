
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
      "# Step Tracer",
      "",
      "No previous query trace was found.",
      "",
      "Send a normal message first, then type: show trace.",
    ].join("\n");
  }

  const safe = (value: string): string =>
    value.replace(/[|\\\n\r]/g, " ");

  const source = (event: FlowEvent): string => {
    if (!event.sourceFile) return "Not recorded";
    return event.sourceFunction
      ? `${event.sourceFile} — ${event.sourceFunction}()`
      : event.sourceFile;
  };

  const metrics = (event: FlowEvent): string => {
    const values: string[] = [];

    if (event.engine) values.push(`engine: ${event.engine}`);
    if (event.stage) values.push(`stage: ${event.stage}`);
    if (event.round !== undefined) values.push(`round: ${event.round}`);
    if (event.attempt !== undefined) values.push(`attempt: ${event.attempt}`);

    if (event.durationMs !== undefined) {
      values.push(`duration: ${event.durationMs} ms`);
    }

    if (event.inputChars !== undefined) {
      values.push(`input chars: ${event.inputChars}`);
    }

    if (event.outputChars !== undefined) {
      values.push(`output chars: ${event.outputChars}`);
    }

    if (event.reasonCode) values.push(`reason: ${event.reasonCode}`);

    if (event.refusalDetected !== undefined) {
      values.push(`refusal: ${event.refusalDetected}`);
    }

    return values.length ? values.map(safe).join("; ") : "—";
  };

  const rows = trace.events.map(
    (event) =>
      `| ${event.id}. ${safe(event.step)} | ${event.status} | ${safe(source(event))} | ${metrics(event)} |`,
  );

  return [
    "# Step Tracer",
    "",
    `- **Trace ID:** ${trace.id}`,
    `- **Started:** ${trace.startedAt}`,
    `- **Finished:** ${trace.finishedAt ?? "Still running"}`,
    `- **Overall status:** ${trace.status}`,
    "",
    "| Step | Status | Source | Metrics |",
    "|---|---|---|---|",
    ...(rows.length ? rows : ["| No steps recorded | — | — | — |"]),
  ].join("\n");
}
