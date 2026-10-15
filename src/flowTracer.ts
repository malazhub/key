
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
    return "No completed query trace is available in this server session yet.";
  }

  const lines = [
    `Query Flow Trace`,
    `Trace ID: ${trace.id}`,
    `Started: ${trace.startedAt}`,
    `Finished: ${trace.finishedAt ?? "still running"}`,
    `Status: ${trace.status}`,
    "",
    ...trace.events.map((event) => {
      const elapsed =
        event.durationMs === undefined ? "" : ` (${event.durationMs} ms)`;
      const detail = event.detail ? ` — ${event.detail}` : "";

      return `${event.id}. [${event.status.toUpperCase()}] ${event.step}${elapsed}${detail}`;
    }),
    "",
    "Only instrumented events are shown. This trace does not expose hidden model reasoning.",
  ];

  return lines.join("\n");
}
