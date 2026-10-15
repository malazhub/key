
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
      "# Query-to-response trace",
      "",
      "No previous query trace was found.",
      "",
      "Send a normal message first, then type: show trace.",
    ].join("\n");
  }

  const lines = [
    "# Query-to-response trace",
    "",
    "- **Trace ID:** " + trace.id,
    "- **Question:** " + (trace.question || "(Question not recorded)"),
    "- **Started:** " + trace.startedAt,
    "- **Finished:** " + (trace.finishedAt ?? "Still running"),
    "- **Execution status:** " +
      (trace.status === "ok"
        ? "OK — the request/response completed; this does not verify answer correctness."
        : trace.status.toUpperCase()),
    "",
    "> Every step below shows the data actually recorded at that boundary. A field marked NOT RECORDED was not captured; it is not inferred.",
    "",
  ];

  function jsonBlock(value: unknown): string[] {
    if (value === undefined) return ["NOT RECORDED"];
    if (value === null) return ["null"];

    let serialized: string;
    try {
      serialized = JSON.stringify(value, null, 2) ?? String(value);
    } catch {
      serialized = "[Value could not be serialized]";
    }

    return ["~~~json", serialized, "~~~"];
  }

  function normalizeStepName(value: string): string {
    return value
      .trim()
      .replace(/^\d+\s*[.):\-]\s*/, "")
      .trim()
      .toLowerCase();
  }

  function readableStepName(value: string): string {
    const step = normalizeStepName(value);

    if (step === "request received") return "Request received";
    if (step === "intent routing") return "Intent routing";
    if (
      step === "engine selection and validation" ||
      step === "engine selection validated"
    ) return "Engine selection and validation";
    if (
      step === "context preparation" ||
      step === "server context preparation"
    ) return "Context preparation";
    if (
      step === "consensus processing" ||
      step === "consensus engine completed"
    ) return "Consensus processing";
    if (
      step === "final response assembly" ||
      step === "final response prepared"
    ) return "Final response assembly";
    if (step === "response delivery") return "Response delivery";
    if (step === "request failed") return "Request failed";

    return value.trim().replace(/^\d+\s*[.):\-]\s*/, "").trim() || "Unnamed step";
  }

  trace.events.forEach((event, index) => {
    const title = readableStepName(event.step);
    const status =
      event.status === "ok"
        ? "COMPLETED"
        : event.status === "error"
          ? "FAILED"
          : event.status === "skipped"
            ? "SKIPPED"
            : "RUNNING";

    lines.push("## Step " + (index + 1) + " — " + title);
    lines.push("");
    lines.push("- **Status:** " + status);
    lines.push("- **Timestamp:** " + event.at);
    if (typeof event.durationMs === "number") {
      lines.push("- **Duration:** " + event.durationMs + " ms");
    }
    lines.push("");

    if (event.detail) {
      lines.push("**Detail**");
      lines.push("");
      lines.push(event.detail);
      lines.push("");
    }

    lines.push("**Incoming**");
    lines.push("");
    lines.push(...jsonBlock(event.incoming));
    lines.push("");
    lines.push("**Outgoing**");
    lines.push("");
    lines.push(...jsonBlock(event.outgoing));
    lines.push("");

    lines.push("**Decision**");
    lines.push("");
    lines.push(event.decision || "NOT RECORDED");
    lines.push("");
  });

  lines.push("## Trace conclusion");
  lines.push("");
  if (trace.status === "ok") {
    lines.push("The request/response path finished without a recorded transport error. Answer correctness is not evaluated by this status.");
  } else if (trace.status === "error") {
    lines.push("The request ended with a recorded error.");
  } else {
    lines.push("The request is still running or has not been finalized.");
  }

  return lines.join("\n");
}
