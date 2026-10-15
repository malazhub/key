
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
    `Started: ${trace.startedAt}`,
    `Finished: ${trace.finishedAt ?? "Still running"}`,
    `Result: ${trace.status === "ok" ? "Completed successfully" : trace.status.toUpperCase()}`,
    "",
    "YOUR MESSAGE",
    "     |",
  ];

  const shownSteps = new Set<string>();

  for (const event of trace.events) {
    const step = event.step.trim().toLowerCase();

    // Hide repeated events that add no new information.
    const key = `${step}:${event.detail ?? ""}`;
    if (shownSteps.has(key)) continue;
    shownSteps.add(key);

    let title = event.step;
    let detail = event.detail ?? "";

    if (step === "request received") {
      title = "Message received by the server";
      detail = "The server accepted your request.";
    } else if (step === "intent routing") {
      title = "Understanding your request";
      detail = detail.includes("chat")
        ? "Classified as a normal conversation."
        : detail.replace(/^Intent type:\s*/i, "Request type: ");
    } else if (step === "engine selection validated") {
      title = "Checking the selected AI engines";
      const engineCount = detail.match(/(\d+)\s+engine/i)?.[1];
      const agreement = detail.match(/(\d+)%/i)?.[1];
      detail = [
        engineCount ? `${engineCount} AI engines selected` : "",
        agreement ? `Target agreement: ${agreement}%` : "",
      ].filter(Boolean).join(". ");
    } else if (step === "server context preparation") {
      title = "Preparing supporting context";
      detail = /no additional live structure context returned/i.test(detail)
        ? "No extra live context was needed for this request."
        : detail;
    } else if (step === "consensus engine completed") {
      title = "AI response generation completed";
      detail = "The consensus process returned its result.";
    } else if (step === "final response prepared") {
      title = "Preparing the reply";
      detail = event.durationMs === undefined
        ? "The response was assembled for delivery."
        : `The response was assembled in ${(event.durationMs / 1000).toFixed(2)} seconds.`;
    } else if (step === "request failed") {
      title = "The request encountered an error";
      detail = detail || "The server could not complete the request.";
    }

    const status =
      event.status === "ok"
        ? "Completed"
        : event.status === "error"
          ? "Failed"
          : event.status;

    lines.push("     v");
    lines.push(title);
    lines.push(`     Result: ${status}`);

    if (detail) {
      lines.push(`     ${detail}`);
    }

    lines.push("     |");
  }

  lines.push(
    "     v",
    "REPLY READY",
    "     |",
    "     v",
    trace.status === "ok"
      ? "Your response was prepared successfully."
      : `Request ended with status: ${trace.status}.`
  );

  return lines.join("\n");
}
