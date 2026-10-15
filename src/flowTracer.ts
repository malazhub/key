
import { randomUUID } from "node:crypto";

export type FlowStatus = "running" | "ok" | "error" | "skipped";

function formatFlowValue(value: unknown): string {
  if (value === undefined) return "NOT RECORDED";
  if (value === null) return "null";
  if (typeof value === "string") return value;

  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return "[Value could not be serialized]";
  }
}
export interface FlowEvent {
  id: number;
  step: string;
  status: FlowStatus;
  at: string;
  durationMs?: number;
  detail?: string;
  incoming?: unknown;
  outgoing?: unknown;
  decision?: string;
}

export interface FlowStepData {
  incoming?: unknown;
  outgoing?: unknown;
  decision?: string;
  detail?: string;
  durationMs?: number;
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
      "QUERY-TO-RESPONSE FLOW",
      "",
      "Your question",
      "     |",
      "     v",
      "Trace lookup",
      "     |",
      "     v",
      "No previous query trace was found.",
      "",
      "Send a normal message first, then type: show trace",
    ].join("\n");
  }

  const lines = [
    "QUERY-TO-RESPONSE FLOW",
    "======================",
    "",
    `Trace: ${trace.id}`,
    `Question: ${trace.question || "(Question not recorded)"}`,
    `Started: ${trace.startedAt}`,
    `Finished: ${trace.finishedAt ?? "Still running"}`,
    `Result: ${trace.status === "ok" ? "Completed successfully" : trace.status.toUpperCase()}`,
    "",
    "QUERY-TO-RESPONSE EXECUTION",
    "     |",
    "     v",
  ];

    for (const event of trace.events) {
    const step = event.step.trim().toLowerCase();

    let title = event.step;
    let detail = event.detail ?? "";

    if (step === "request received") {
      title = "1. Request received";
      detail = "The server accepted the user's question.";
    } else if (step === "intent routing") {
      title = "2. Request intent determined";
      detail = detail.includes("chat")
        ? "Classified as a normal conversation."
        : detail.replace(/^Intent type:\s*/i, "Request type: ");
    } else if (step === "engine selection validated") {
      title = "3. AI engine selection validated";
      const engineCount = detail.match(/(\d+)\s+engine/i)?.[1];
      const agreement = detail.match(/(\d+)%/i)?.[1];

      detail = [
        engineCount ? `${engineCount} AI engines selected` : detail,
        agreement ? `Target agreement: ${agreement}%` : "",
      ].filter(Boolean).join(". ");
    } else if (step === "server context preparation") {
      title = "4. Request context prepared";
      detail = /no additional live structure context returned/i.test(detail)
        ? "No additional live context was returned."
        : detail;
    } else if (step === "consensus engine completed") {
      title = "5. Consensus processing completed";
      detail = "The consensus process returned its result.";
    } else if (step === "final response prepared") {
      title = "6. Final response prepared";
      detail = event.durationMs === undefined
        ? "The response was assembled for delivery."
        : `Response assembly took ${(event.durationMs / 1000).toFixed(2)} seconds.`;
    } else if (step === "request failed") {
      title = "Request failed";
      detail = detail || "The server could not complete the request.";
    }

    const status =
      event.status === "ok"
        ? "COMPLETED"
        : event.status === "error"
          ? "FAILED"
          : event.status === "skipped"
            ? "SKIPPED"
            : "RUNNING";

    lines.push(`     ${title}`);
    lines.push("          |");
    lines.push(`          +-- Status: ${status}`);

    if (typeof event.durationMs === "number") {
      lines.push(`          +-- Duration: ${event.durationMs} ms`);
    }

    if (detail) {
  lines.push(`          +-- ${detail}`);
}
lines.push(`          +-- Timestamp: ${event.at}`);
lines.push(`          +-- Input: ${formatFlowValue(event.incoming)}`);
lines.push(`          +-- Output: ${formatFlowValue(event.outgoing)}`);
lines.push(`          +-- Decision: ${event.decision ?? "NOT RECORDED"}`);

    lines.push("          |");
    lines.push("          v");
  }

  lines.push(
    trace.status === "ok"
      ? "FINAL RESPONSE DELIVERED"
      : trace.status === "error"
        ? "REQUEST ENDED WITH AN ERROR"
        : "REQUEST STILL RUNNING"
  );

  return lines.join("\n");
}
