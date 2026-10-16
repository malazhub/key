
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

  const contributions = Array.isArray(payload.nodeContributions)
    ? payload.nodeContributions
    : [];

  const engines = contributions.flatMap((item): string[] => {
    if (!item || typeof item !== "object") return [];

    const node = item as Record<string, unknown>;
    const name =
      typeof node.modelName === "string"
        ? node.modelName
        : typeof node.engine === "string"
          ? node.engine
          : undefined;

    if (!name) return [];

    const score =
      typeof node.agreementScore === "number"
        ? ` — ${node.agreementScore}% match`
        : "";

    return [`- ${name}${score}`];
  });

  const lines = [
    "# Query-to-response trace",
    "",
    "## Original user query",
    "",
    "~~~text",
    trace.question,
    "~~~",
  ];

  if (answer) {
    lines.push("", "## Final answer", "", answer);
  }

  if (achieved !== undefined) {
    lines.push(
      "",
      `Achieved agreement: ${achieved}%` +
        (target !== undefined ? ` | Target: ${target}%` : ""),
    );
  } else if (target !== undefined) {
    lines.push("", `Target agreement: ${target}%`);
  }

  if (rounds !== undefined) {
    lines.push(`Rounds completed: ${rounds}`);
  }

  if (summary) {
    lines.push("", `Consensus summary: ${summary}`);
  }

  if (engines.length > 0) {
    lines.push(
      "",
      "## Engines responding in the final round",
      ...engines,
    );
  }

  return lines.join("\n");
}
