import test from "node:test";
import assert from "node:assert/strict";

import {
  buildQueryExecutionPlan,
  executeAdaptiveRetrieval,
  runBoundedCorrectiveRetrieval,
  MAX_CORRECTIVE_PASSES,
  type AdaptiveCandidate,
} from "./queryExecutionPlanner.ts";

function makeCandidate(
  id: string,
  source: AdaptiveCandidate["source"],
  title: string,
  content: string
): AdaptiveCandidate {
  return {
    id,
    source,
    title,
    content,
    channelScores: {
      semantic: 0,
      bm25: 0,
      entity: 0,
      temporal: 0,
      exactReference: 0,
    },
    score: 0,
  };
}

async function makeQueryContextPlan(query: string) {
  const plan = await buildQueryExecutionPlan(query);

  plan.retrieval.sources = ["query_context"];
  plan.retrieval.maxCandidates = 8;
  plan.retrieval.temporal = false;
  plan.retrieval.entityCoverage = false;
  plan.retrieval.exactReference = false;

  plan.evidenceNeeds = {
    recentContext: false,
    longTermMemory: false,
    knowledge: false,
    webGrounding: false,
    attachments: false,
    temporal: false,
    exactReference: false,
    entityCoverage: false,
  };

  plan.sourcePolicy.query_context = true;

  return plan;
}

test("relevant candidates rank above unrelated candidates", async () => {
  const plan = await makeQueryContextPlan("alpha status");

  const result = executeAdaptiveRetrieval(plan, [
    makeCandidate(
      "relevant",
      "query_context",
      "Alpha status",
      "The alpha status is available."
    ),
    makeCandidate(
      "unrelated",
      "query_context",
      "Cooking notes",
      "A recipe for bread."
    ),
  ]);

  assert.equal(result.selected[0]?.id, "relevant");
});

test("disabled sources are excluded from ranked candidates", async () => {
  const plan = await makeQueryContextPlan("alpha status");

  const result = executeAdaptiveRetrieval(plan, [
    makeCandidate(
      "allowed",
      "query_context",
      "Alpha status",
      "Alpha status evidence."
    ),
    makeCandidate(
      "blocked",
      "web_grounding",
      "Alpha status",
      "Web evidence that should be excluded."
    ),
  ]);

  assert.deepEqual(
    result.candidates.map((candidate) => candidate.id),
    ["allowed"]
  );
});

test("words such as latest do not create temporal evidence", async () => {
  const plan = await makeQueryContextPlan("latest alpha status");
  plan.retrieval.temporal = true;

  const result = executeAdaptiveRetrieval(plan, [
    makeCandidate(
      "text-only",
      "query_context",
      "Latest alpha status",
      "This text mentions the latest alpha status."
    ),
  ]);

  assert.equal(result.candidates[0]?.channelScores.temporal, 0);
});

test("corrective retrieval never exceeds its pass limit", async () => {
  const plan = await makeQueryContextPlan("current alpha status");
  plan.retrieval.temporal = true;

  const initial = executeAdaptiveRetrieval(plan, [
    makeCandidate(
      "seed",
      "query_context",
      "Current alpha status",
      "The current alpha status is recorded."
    ),
  ]);

  let retrievalCalls = 0;

  const result = await runBoundedCorrectiveRetrieval(
    plan,
    initial,
    async () => {
      retrievalCalls += 1;
      return [];
    }
  );

  assert.ok(retrievalCalls <= MAX_CORRECTIVE_PASSES);
  assert.ok(result.correctivePasses <= MAX_CORRECTIVE_PASSES);
});
test("standalone factual question does not require conversation history", async () => {
  const plan = await buildQueryExecutionPlan(
    "What is the difference between photosynthesis and cellular respiration?",
  );
  assert.equal(plan.requiresConversationHistory, false);
  assert.equal(plan.historyReason, null);
});

test("explicit continuation requires conversation history", async () => {
  const plan = await buildQueryExecutionPlan(
    "Continue investigating the repository we discussed.",
  );
  assert.equal(plan.requiresConversationHistory, true);
  assert.notEqual(plan.historyReason, null);
});

test("planner preserves the exact original query", async () => {
  const query = "How do I fix the failing test in src/foo.ts?";
  const plan = await buildQueryExecutionPlan(query);
  assert.equal(plan.originalQuery, query);
});

test("planner always provides task and output classifications", async () => {
  const plan = await buildQueryExecutionPlan("Compare these two approaches.");
  assert.ok(plan.taskType);
  assert.ok(Array.isArray(plan.requiredOutput));
  assert.ok(plan.requiredOutput.length > 0);
});

test("modification without code context is not classified as coding", async () => {
  const plan = await buildQueryExecutionPlan(
    "Revise this paragraph to sound more professional.",
  );
  assert.notEqual(plan.taskType, "coding");
});

test("modification with code context is classified as coding", async () => {
  const plan = await buildQueryExecutionPlan(
    "Fix the TypeScript function in src/foo.ts that fails on null input.",
  );
  assert.equal(plan.taskType, "coding");
});

test("model-output 'coding' is rejected when the query has no code context", async () => {
  const fakePlanner = async () =>
    JSON.stringify({
      polarity: "modification",
      objective: "improve prose",
      taskType: "coding",
      requiredOutput: ["code_patch"],
      evidenceNeeds: { knowledge: true },
      retrieval: { sources: ["knowledge"], maxCandidates: 8 },
      queryExpansions: [],
      constraints: [],
      prohibitions: [],
      confidence: 0.7,
    });

  const plan = await buildQueryExecutionPlan(
    "Revise this paragraph to sound more professional.",
    fakePlanner,
  );

  assert.notEqual(plan.taskType, "coding");
});

test("model-output 'coding' is accepted when the query has code context", async () => {
  const fakePlanner = async () =>
    JSON.stringify({
      polarity: "modification",
      objective: "apply a code fix",
      taskType: "coding",
      requiredOutput: ["code_patch", "unit_tests"],
      evidenceNeeds: { knowledge: true },
      retrieval: { sources: ["knowledge"], maxCandidates: 8 },
      queryExpansions: [],
      constraints: [],
      prohibitions: [],
      confidence: 0.82,
    });

  const plan = await buildQueryExecutionPlan(
    "Fix the null-pointer bug in src/util.ts.",
    fakePlanner,
  );

  assert.equal(plan.taskType, "coding");
  assert.deepEqual(plan.requiredOutput, ["code_patch", "unit_tests"]);
});

test("model-output requiredOutput with only invalid entries falls back to ['direct_answer']", async () => {
  const fakePlanner = async () =>
    JSON.stringify({
      polarity: "question",
      objective: "answer the question",
      taskType: "question",
      requiredOutput: [123, null, { x: 1 }, ""],
      evidenceNeeds: { knowledge: true },
      retrieval: { sources: ["knowledge"], maxCandidates: 8 },
      queryExpansions: [],
      constraints: [],
      prohibitions: [],
      confidence: 0.75,
    });

  const plan = await buildQueryExecutionPlan("What is a monad?", fakePlanner);

  assert.deepEqual(plan.requiredOutput, ["direct_answer"]);
});
