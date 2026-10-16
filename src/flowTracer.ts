
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

  type LogicalStep = {
    key: string;
    name: string;
    events: FlowEvent[];
    isConsensusRound: boolean;
  };

  const groups: LogicalStep[] = [];
  const groupsByKey = new Map<string, LogicalStep>();

  for (const event of trace.events) {
    const roundMatch = event.step.match(
      /\bconsensus\s+round\s*#?\s*(\d+)\b/i,
    );

    let key: string;
    let name: string;
    let isConsensusRound = false;

    if (roundMatch) {
      const roundNumber = Number(roundMatch[1]);

      key = `consensus-round-${roundNumber}`;
      name = `Consensus round ${roundNumber}`;
      isConsensusRound = true;
    } else {
      key = `event-${event.id}`;
      name = event.step;
    }

    let group = groupsByKey.get(key);

    if (!group) {
      group = {
        key,
        name,
        events: [],
        isConsensusRound,
      };

      groupsByKey.set(key, group);
      groups.push(group);
    }

    group.events.push(event);
  }

  const lines = [
    "# Query-to-response trace",
    "",
    "## Original user query",
    "",
    trace.question,
    "",
    "## Processing tree",
    "",
    "Each logical step shows only its incoming and final outgoing status.",
    "All engine calls and intermediate responses within a consensus round are hidden.",
  ];

  for (const [index, group] of groups.entries()) {
    const events = group.events;
    const last = events[events.length - 1];

    const hasIncoming = events.some(
      (event) => event.incoming !== undefined,
    );

    const hasOutgoing = events.some(
      (event) => event.outgoing !== undefined,
    );

    const terminalEvents = events.filter(
      (event) =>
        event.status === "ok" ||
        event.status === "error" ||
        event.status === "skipped",
    );

    const finalStatus =
      terminalEvents.length > 0
        ? terminalEvents[terminalEvents.length - 1].status
        : last.status;

    lines.push(
      "",
      `### Step ${index + 1}: ${group.name}`,
      "",
      `Incoming: ${hasIncoming || group.isConsensusRound ? "Received" : "Not recorded"}`,
      `Outgoing: ${
        hasOutgoing
          ? "Final result produced"
          : group.isConsensusRound && terminalEvents.length > 0
            ? "Round processing completed"
            : "Not recorded"
      }`,
      `Status: ${finalStatus}`,
    );

    if (group.isConsensusRound) {
      lines.push("Engine calls and intermediate outputs: Hidden");
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
