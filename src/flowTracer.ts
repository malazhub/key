
import { randomUUID } from "node:crypto";

export type FlowStatus = "running" | "ok" | "error" | "skipped";

export interface FlowEvent {
  id: number;
  step: string;
  status: FlowStatus;
  at: string;
  durationMs?: number;
  detail?: string;
}

export interface FlowTrace {
  id: string;
  startedAt: string;
  finishedAt?: string;
  status: FlowStatus;
  events: FlowEvent[];
}

const MAX_TRACES = 30;
const traces = new Map<string, FlowTrace>();
let latestCompletedTraceId: string | undefined;

export function startFlowTrace(): string {
  const id = randomUUID();

  traces.set(id, {
    id,
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
      "QUERY-TO-RESPONSE FLOWCHART",
      "",
      "[Show Trace Command]",
      "        |",
      "        v",
      "[Trace Lookup]",
      "        |",
      "        v",
      "[No Completed Query Trace Found]",
      "",
      "Run a normal query first, then ask: show trace",
    ].join("\n");
  }

  const lines = [
    "QUERY-TO-RESPONSE FLOWCHART",
    "",
    `Trace ID: ${trace.id}`,
    `Started: ${trace.startedAt}`,
    `Finished: ${trace.finishedAt ?? "Still running"}`,
    `Overall Status: ${trace.status.toUpperCase()}`,
    "",
    "[USER QUERY RECEIVED]",
    "        |",
  ];

  for (const event of trace.events) {
    const status =
      event.status === "ok"
        ? "PASS"
        : event.status === "error"
          ? "FAIL"
          : event.status.toUpperCase();

    const elapsed =
      event.durationMs === undefined
        ? ""
        : ` | ${event.durationMs} ms`;

    lines.push("        v");
    lines.push(
      `[${String(event.id).padStart(2, "0")}] ${event.step}`
    );
    lines.push(`     Status: ${status}${elapsed}`);

    if (event.detail) {
      lines.push(`     Detail: ${event.detail}`);
    }

    lines.push("        |");
  }

  lines.push(
    "        v",
    "[FINAL RESPONSE PREPARED]",
    "        |",
    "        v",
    `[REQUEST FINISHED: ${trace.status.toUpperCase()}]`,
    "",
    "Only instrumented execution events are shown; hidden model reasoning is not exposed."
  );

  return lines.join("\n");
}
