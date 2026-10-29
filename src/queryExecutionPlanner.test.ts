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
    liveStructure: false,
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
