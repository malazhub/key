import test from "node:test";
import assert from "node:assert/strict";

import type { GoogleGenAI } from "@google/genai";

import {
  calculateSimilarity,
  buildDispatchAudit,
  dispatchEngine,
  runSmartMemoryConsensusLoop,
  type EngineDispatchAudit,
  type EngineDispatchRequest,
  type EngineDispatchResult,
} from "./consensusEngine.ts";

// ---------------------------------------------------------------------------
// calculateSimilarity
// ---------------------------------------------------------------------------

test("calculateSimilarity: a single response returns 100", () => {
  assert.equal(calculateSimilarity(["The answer is A."]), 100);
});

test("calculateSimilarity: zero responses returns 0", () => {
  assert.equal(calculateSimilarity([]), 0);
});

test("calculateSimilarity: identical responses return 100", () => {
  assert.equal(calculateSimilarity(["hello world", "hello world"]), 100);
});

test("calculateSimilarity: dissimilar responses return < 100", () => {
  const score = calculateSimilarity([
    "the quick brown fox jumps over the lazy dog",
    "completely unrelated topic about quantum entanglement",
  ]);
  assert.ok(score < 100, `expected < 100, got ${score}`);
});

test("calculateSimilarity: empty strings return 0", () => {
  assert.equal(calculateSimilarity(["", ""]), 0);
});

// ---------------------------------------------------------------------------
// buildDispatchAudit
// ---------------------------------------------------------------------------

test("buildDispatchAudit: pre-dispatch rejection", () => {
  const audit = buildDispatchAudit({
    engineId: "ChatGPT 4o",
    queryId: "dr_test",
    round: 1,
    originalQueryHash: "abc",
    dispatchStarted: false,
    providerResponded: false,
    answerUsable: false,
    errorMessage: "credential not configured",
  });
  assert.equal(audit.dispatched, false);
  assert.equal(audit.responseReceived, false);
  assert.equal(audit.usableResponse, false);
  assert.equal(audit.error, "credential not configured");
});

test("buildDispatchAudit: network failure (dispatched, no HTTP response)", () => {
  const audit = buildDispatchAudit({
    engineId: "ChatGPT 4o",
    queryId: "dr_test",
    round: 1,
    originalQueryHash: "abc",
    dispatchStarted: true,
    providerResponded: false,
    answerUsable: false,
    errorMessage: "timeout",
  });
  assert.equal(audit.dispatched, true);
  assert.equal(audit.responseReceived, false);
  assert.equal(audit.usableResponse, false);
});

test("buildDispatchAudit: HTTP error is a received response", () => {
  const audit = buildDispatchAudit({
    engineId: "ChatGPT 4o",
    queryId: "dr_test",
    round: 1,
    originalQueryHash: "abc",
    dispatchStarted: true,
    providerResponded: true,
    answerUsable: false,
    errorMessage: "HTTP 500",
  });
  assert.equal(audit.dispatched, true);
  assert.equal(audit.responseReceived, true);
  assert.equal(audit.usableResponse, false);
});

test("buildDispatchAudit: empty provider response is still a received response", () => {
  const audit = buildDispatchAudit({
    engineId: "ChatGPT 4o",
    queryId: "dr_test",
    round: 1,
    originalQueryHash: "abc",
    dispatchStarted: true,
    providerResponded: true,
    answerUsable: false,
    errorMessage: "Empty provider response",
  });
  assert.equal(audit.dispatched, true);
  assert.equal(audit.responseReceived, true);
  assert.equal(audit.usableResponse, false);
});

test("buildDispatchAudit: successful response has all three true", () => {
  const audit = buildDispatchAudit({
    engineId: "ChatGPT 4o",
    queryId: "dr_test",
    round: 1,
    originalQueryHash: "abc",
    dispatchStarted: true,
    providerResponded: true,
    answerUsable: true,
  });
  assert.equal(audit.dispatched, true);
  assert.equal(audit.responseReceived, true);
  assert.equal(audit.usableResponse, true);
  assert.equal(audit.error, undefined);
});

// ---------------------------------------------------------------------------
// Real dispatchEngine — provider-boundary callback tests via fetchFn seam
// ---------------------------------------------------------------------------

function makeJsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("dispatchEngine (Google): onProviderDispatch before fetch, onProviderResponse after", async () => {
  process.env.GEMINI_API_KEY = "test-key";
  const events: string[] = [];
  const mockFetch = (async () => {
    events.push("fetch");
    return makeJsonResponse({
      candidates: [{ content: { parts: [{ text: "hello" }] } }],
    });
  }) as unknown as typeof fetch;

  await dispatchEngine({
    engine: "Gemini 2.5",
    prompt: "hi",
    systemInstruction: "you are helpful",
    fetchFn: mockFetch,
    maxProviderAttempts: 1,
    onProviderDispatch: () => events.push("dispatch"),
    onProviderResponse: () => events.push("response"),
  });

  assert.deepEqual(events, ["dispatch", "fetch", "response"]);
});

test("dispatchEngine (Anthropic): onProviderDispatch before fetch, onProviderResponse after", async () => {
  process.env.ANTHROPIC_API_KEY = "test-key";
  const events: string[] = [];
  const mockFetch = (async () => {
    events.push("fetch");
    return makeJsonResponse({ content: [{ text: "hello" }] });
  }) as unknown as typeof fetch;

  await dispatchEngine({
    engine: "Claude 3.5 Sonnet",
    prompt: "hi",
    systemInstruction: "you are helpful",
    fetchFn: mockFetch,
    maxProviderAttempts: 1,
    onProviderDispatch: () => events.push("dispatch"),
    onProviderResponse: () => events.push("response"),
  });

  assert.deepEqual(events, ["dispatch", "fetch", "response"]);
});

test("dispatchEngine (Cohere): onProviderDispatch before fetch, onProviderResponse after", async () => {
  process.env.COHERE_API_KEY = "test-key";
  const events: string[] = [];
  const mockFetch = (async () => {
    events.push("fetch");
    return makeJsonResponse({ message: { content: "hello" } });
  }) as unknown as typeof fetch;

  await dispatchEngine({
    engine: "Command R+",
    prompt: "hi",
    systemInstruction: "you are helpful",
    fetchFn: mockFetch,
    maxProviderAttempts: 1,
    onProviderDispatch: () => events.push("dispatch"),
    onProviderResponse: () => events.push("response"),
  });

  assert.deepEqual(events, ["dispatch", "fetch", "response"]);
});

test("dispatchEngine (OpenAI-compatible): onProviderDispatch before fetch, onProviderResponse after", async () => {
  process.env.OPENAI_API_KEY = "test-key";
  const events: string[] = [];
  const mockFetch = (async () => {
    events.push("fetch");
    return makeJsonResponse({ choices: [{ message: { content: "hello" } }] });
  }) as unknown as typeof fetch;

  await dispatchEngine({
    engine: "ChatGPT 4o",
    prompt: "hi",
    systemInstruction: "you are helpful",
    fetchFn: mockFetch,
    maxProviderAttempts: 1,
    onProviderDispatch: () => events.push("dispatch"),
    onProviderResponse: () => events.push("response"),
  });

  assert.deepEqual(events, ["dispatch", "fetch", "response"]);
});

test("dispatchEngine: HTTP 500 still fires onProviderResponse after fetch", async () => {
  process.env.OPENAI_API_KEY = "test-key";
  const events: string[] = [];
  const mockFetch = (async () => {
    events.push("fetch");
    return new Response("Internal Server Error", { status: 500 });
  }) as unknown as typeof fetch;

  await assert.rejects(
    dispatchEngine({
      engine: "ChatGPT 4o",
      prompt: "hi",
      systemInstruction: "you are helpful",
      fetchFn: mockFetch,
      maxProviderAttempts: 1,
      onProviderDispatch: () => events.push("dispatch"),
      onProviderResponse: () => events.push("response"),
    }),
  );

  assert.deepEqual(events, ["dispatch", "fetch", "response"]);
});

test("dispatchEngine (Anthropic): abort signal is propagated to fetch", async () => {
  process.env.ANTHROPIC_API_KEY = "test-key";
  let capturedSignal: AbortSignal | undefined;
  const mockFetch = (async (_url: string, init?: RequestInit) => {
    capturedSignal = init?.signal ?? undefined;
    return makeJsonResponse({ content: [{ text: "hello" }] });
  }) as unknown as typeof fetch;

  const controller = new AbortController();
  await dispatchEngine({
    engine: "Claude 3.5 Sonnet",
    prompt: "hi",
    systemInstruction: "you are helpful",
    fetchFn: mockFetch,
    maxProviderAttempts: 1,
    signal: controller.signal,
  });

  assert.ok(capturedSignal instanceof AbortSignal);
});

test("dispatchEngine (Cohere): abort signal is propagated to fetch", async () => {
  process.env.COHERE_API_KEY = "test-key";
  let capturedSignal: AbortSignal | undefined;
  const mockFetch = (async (_url: string, init?: RequestInit) => {
    capturedSignal = init?.signal ?? undefined;
    return makeJsonResponse({ message: { content: "hello" } });
  }) as unknown as typeof fetch;

  const controller = new AbortController();
  await dispatchEngine({
    engine: "Command R+",
    prompt: "hi",
    systemInstruction: "you are helpful",
    fetchFn: mockFetch,
    maxProviderAttempts: 1,
    signal: controller.signal,
  });

  assert.ok(capturedSignal instanceof AbortSignal);
});

test("dispatchEngine (OpenAI-compatible): abort signal is propagated to fetch", async () => {
  process.env.OPENAI_API_KEY = "test-key";
  let capturedSignal: AbortSignal | undefined;
  const mockFetch = (async (_url: string, init?: RequestInit) => {
    capturedSignal = init?.signal ?? undefined;
    return makeJsonResponse({ choices: [{ message: { content: "hello" } }] });
  }) as unknown as typeof fetch;

  const controller = new AbortController();
  await dispatchEngine({
    engine: "ChatGPT 4o",
    prompt: "hi",
    systemInstruction: "you are helpful",
    fetchFn: mockFetch,
    maxProviderAttempts: 1,
    signal: controller.signal,
  });

  assert.ok(capturedSignal instanceof AbortSignal);
});

// ---------------------------------------------------------------------------
// Loop-level audit bookkeeping via injected dispatchEngineFn
// ---------------------------------------------------------------------------

function createMockAiClient(): GoogleGenAI {
  return {
    models: {
      generateContent: async () => {
        throw new Error("mock verifier: not available in tests");
      },
    },
  } as unknown as GoogleGenAI;
}

function createMockDispatchEngine(behavior: {
  onDispatch?: boolean;
  onResponse?: boolean;
  answer?: string;
  throws?: string;
}): (req: EngineDispatchRequest) => Promise<EngineDispatchResult> {
  return async (req: EngineDispatchRequest): Promise<EngineDispatchResult> => {
    if (behavior.onDispatch) req.onProviderDispatch?.();
    if (behavior.onResponse) req.onProviderResponse?.();
    if (behavior.throws) throw new Error(behavior.throws);
    return {
      engine: req.engine,
      provider: "openai",
      modelId: "gpt-6-luna",
      answer: behavior.answer ?? "",
      latencyMs: 100,
    };
  };
}

test("loop: pre-provider failure produces dispatched=false", async () => {
  const mockDispatch = createMockDispatchEngine({
    onDispatch: false,
    onResponse: false,
    throws: "credential not configured",
  });

  const result = await runSmartMemoryConsensusLoop(
    "test query",
    [],
    ["ChatGPT 4o"],
    95,
    {
      dispatchEngineFn: mockDispatch,
      aiClient: createMockAiClient(),
      maxProviderAttempts: 1,
    },
  );

  const audits: EngineDispatchAudit[] = result.dispatchAudits || [];
  const first = audits.find((a) => a.round === 1);
  assert.ok(first);
  assert.equal(first.dispatched, false);
  assert.equal(first.responseReceived, false);
  assert.equal(first.usableResponse, false);
});

test("loop: provider network failure produces dispatched=true, responseReceived=false", async () => {
  const mockDispatch = createMockDispatchEngine({
    onDispatch: true,
    onResponse: false,
    throws: "network error",
  });

  const result = await runSmartMemoryConsensusLoop(
    "test query",
    [],
    ["ChatGPT 4o"],
    95,
    {
      dispatchEngineFn: mockDispatch,
      aiClient: createMockAiClient(),
      maxProviderAttempts: 1,
    },
  );

  const audits: EngineDispatchAudit[] = result.dispatchAudits || [];
  const first = audits.find((a) => a.round === 1);
  assert.ok(first);
  assert.equal(first.dispatched, true);
  assert.equal(first.responseReceived, false);
  assert.equal(first.usableResponse, false);
});

test("loop: empty provider answer produces responseReceived=true, usableResponse=false", async () => {
  const mockDispatch = createMockDispatchEngine({
    onDispatch: true,
    onResponse: true,
    answer: "",
  });

  const result = await runSmartMemoryConsensusLoop(
    "test query",
    [],
    ["ChatGPT 4o"],
    95,
    {
      dispatchEngineFn: mockDispatch,
      aiClient: createMockAiClient(),
      maxProviderAttempts: 1,
    },
  );

  const audits: EngineDispatchAudit[] = result.dispatchAudits || [];
  const first = audits.find((a) => a.round === 1);
  assert.ok(first);
  assert.equal(first.dispatched, true);
  assert.equal(first.responseReceived, true);
  assert.equal(first.usableResponse, false);
});

test("loop: successful provider answer produces all three true", async () => {
  const mockDispatch = createMockDispatchEngine({
    onDispatch: true,
    onResponse: true,
    answer: "The answer is A.",
  });

  const result = await runSmartMemoryConsensusLoop(
    "test query",
    [],
    ["ChatGPT 4o"],
    95,
    {
      dispatchEngineFn: mockDispatch,
      aiClient: createMockAiClient(),
      maxProviderAttempts: 1,
    },
  );

  const audits: EngineDispatchAudit[] = result.dispatchAudits || [];
  const first = audits.find((a) => a.round === 1);
  assert.ok(first);
  assert.equal(first.dispatched, true);
  assert.equal(first.responseReceived, true);
  assert.equal(first.usableResponse, true);
});

test("loop: audit queryId is stable across rounds for a single user turn", async () => {
  const mockDispatch = createMockDispatchEngine({
    onDispatch: true,
    onResponse: true,
    throws: "always fails",
  });

  const result = await runSmartMemoryConsensusLoop(
    "test query",
    [],
    ["ChatGPT 4o"],
    95,
    {
      dispatchEngineFn: mockDispatch,
      aiClient: createMockAiClient(),
      maxProviderAttempts: 1,
    },
  );

  const audits: EngineDispatchAudit[] = result.dispatchAudits || [];
  const roundOne = audits.filter((a) => a.round === 1);
  const roundTwo = audits.filter((a) => a.round === 2);
  assert.ok(roundOne.length > 0 && roundTwo.length > 0);
  assert.equal(roundOne[0].queryId, roundTwo[0].queryId);
  assert.equal(roundOne[0].originalQueryHash, roundTwo[0].originalQueryHash);
});

test("loop: dispatch run IDs are unique across sequential invocations", async () => {
  const mockDispatch = createMockDispatchEngine({
    onDispatch: true,
    onResponse: true,
    throws: "always fails",
  });

  const r1 = await runSmartMemoryConsensusLoop(
    "same question",
    [],
    ["ChatGPT 4o"],
    95,
    {
      dispatchEngineFn: mockDispatch,
      aiClient: createMockAiClient(),
      maxProviderAttempts: 1,
    },
  );
  const r2 = await runSmartMemoryConsensusLoop(
    "same question",
    [],
    ["ChatGPT 4o"],
    95,
    {
      dispatchEngineFn: mockDispatch,
      aiClient: createMockAiClient(),
      maxProviderAttempts: 1,
    },
  );

  const id1 = (r1.dispatchAudits || [])[0]?.queryId;
  const id2 = (r2.dispatchAudits || [])[0]?.queryId;
  assert.ok(id1 && id2);
  assert.notEqual(id1, id2);
});
