/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Key — Live Web Search, 5-Channel Memory Search & Multi-Engine Query Push Router
 * File: src/searchAndEnginePushRouter.ts
 */
import {
  startFlowTrace,
  recordFlowStep,
  finishFlowTrace,
  getLatestFlowTrace,
  formatFlowTrace,
} from "./flowTracer";
import { assertDefendedQuery } from "./security/queryGuard";
import { GoogleGenAI, Type } from "@google/genai";
import {
  CANDIDATE_MODELS,
  getAvailableCandidateModels,
  markModelCooldown,
  isQuotaOrRateLimitError,
  fetchGoogleSearchGrounding,
  runMemoryOperatingSystemPipeline,
  purgeAndIsolateContext,
  executeConsensus,
  executeConsensusApiPayload,
  runSmartMemoryConsensusLoop,
  type GroundingSource,
  type HistoryTurn,
  type IncomingAttachment,
  type MemoryOSPipelineTrace,
} from "./consensusEngine";



export interface SearchAndEnginePushRequest {
  question: string;
  history?: HistoryTurn[];
  activeModels?: string[];
  targetAgreement?: number;
  strictQueryPriority?: boolean;
  buildAppMode?: boolean;
  adminUpgradeMode?: boolean;
  nextVersionTag?: string;
  attachments?: IncomingAttachment[];
}

export interface SearchAndEnginePushResult {
  queryDispatchedToEngines: string;
  strictQueryPriority: boolean;
  contextMode: "NEW_QUERY_ONLY" | "MERGED_WITH_SAVED";
  historyMatchScore: number;
  webSearchSources: GroundingSource[];
  memorySearchTrace: MemoryOSPipelineTrace;
  finalAnswer: string;
  achievedAgreement: number;
  iterationsRequired: number;
  activeModels: string[];
  hasAppPreview: boolean;
  appTitle: string;
  generatedAppHtml: string;
  nodeContributions: Array<{
    modelName: string;
    initialReply: string;
    finalMatchedReply: string;
    detailedResponse: string;
    agreementScore: number;
  }>;
}

/**
 * STEP 1: Live Web Search Grounding + 5-Channel Parallel Memory Search
 * Executes real-time Google Search Grounding (`tools: [{ googleSearch: {} }]`) in parallel
 * with Key's 5-Channel Memory Operating System (Semantic, BM25, Entity, Temporal, Exact-Ref).
 */
export async function executeKeySearchPipeline(
  question: string,
  history: HistoryTurn[] = [],
  options?: {
    forceIsolated?: boolean;
    flowTraceId?: string;
  }
): Promise<{
  webSearchSources: GroundingSource[];
  memorySearchTrace: MemoryOSPipelineTrace;
}> {
    const traceId = options?.flowTraceId;
  const cleanQuestion = String(question || "").trim();

  assertDefendedQuery(cleanQuestion);

  const memorySearchTrace = await runMemoryOperatingSystemPipeline(
    cleanQuestion,
    history,
    {
      forceIsolated: options?.forceIsolated,
    }
  );

  if (!cleanQuestion) {
    return {
      webSearchSources: [],
      memorySearchTrace,
    };
  }

  const webSearchSources: GroundingSource[] = [];

  if (traceId) {
    recordFlowStep(
      traceId,
      "Search pipeline completed",
      "ok",
      {
        sourceFile: "src/searchAndEnginePushRouter.ts",
        sourceFunction: "executeKeySearchPipeline",
        outgoing: {
          webSourceCount: webSearchSources.length,
        },
      }
    );
  }

  return {
    webSearchSources,
    memorySearchTrace,
  };
}

/**
 * STEP 2: Strict Query-Priority Isolation & Payload Builder
 * Purges unrelated prior context (`NEW_QUERY_ONLY`) or merges related history (`MERGED_WITH_SAVED`)
 * before pushing the query payload to the 10 AI engines.
 */
export function buildEngineQueryPayload(
  question: string,
  strictPriorityOverride = false
): {
  payloadSentToEngines: string;
  strictQueryPriority: boolean;
  contextMode: "NEW_QUERY_ONLY" | "MERGED_WITH_SAVED";
} {
  const cleanQ = String(question || "").trim();
  const isolated = purgeAndIsolateContext(strictPriorityOverride, cleanQ);
  const isIsolated = isolated.historyMatchScore === 0;
  return {
    payloadSentToEngines: isolated.payloadSentToEngines,
    strictQueryPriority: isIsolated,
    contextMode: isIsolated ? "NEW_QUERY_ONLY" : "MERGED_WITH_SAVED",
  };
}

/**
 * STEP 3: Push Query to Selected AI Engines & Converge Consensus
 * Dispatches the isolated/merged query payload + live search grounding across the active AI engines
 * using parallel hedged model execution (`gemini-flash-lite-latest`, `gemini-3-flash-preview`, etc.)
 * until reaching the target consensus threshold (>= targetAgreement%).
 */
/**
 * STEP 3: Push Query to Selected AI Engines & Converge Consensus
 * Dispatches the isolated/merged query payload + live search grounding across the active AI engines
 * using parallel hedged model execution (`gemini-flash-lite-latest`, `gemini-3-flash-preview`, etc.)
 * until reaching the target consensus threshold (>= targetAgreement%).
 */
export async function pushQueryToEnginesAndConverge(
  request: SearchAndEnginePushRequest
): Promise<Record<string, any>> {
   const startedAt = Date.now();
  const effectiveQuestion = String(request.question || "").trim();

  // Show the previous completed trace only when explicitly requested.
  const traceRequestText = effectiveQuestion;

  const wantsFlowTrace =
    /\b(show|display|print|view|inspect|explain|walk me through)\b[\s\S]{0,120}\b(trace|execution flow|logic steps|processing steps|inputs and outputs)\b/i.test(
      traceRequestText
    ) ||
    /\b(trace the logic|trace the flow|trace from the beginning|steps from the beginning of (the )?query|query to the final response)\b/i.test(
      traceRequestText
    ) ||
    /^(?:show\s+)?trace$/i.test(traceRequestText);

  if (wantsFlowTrace) {
    return {
      answer: formatFlowTrace(getLatestFlowTrace()),
      tracerOnly: true,
    };
  }

  const flowTraceId = startFlowTrace(effectiveQuestion);

  recordFlowStep(
    flowTraceId,
    "1. Request received",
    "ok",
    {
      sourceFile: "src/searchAndEnginePushRouter.ts",
      sourceFunction: "pushQueryToEnginesAndConverge",
      incoming: {
        queryChars: effectiveQuestion.length,
        activeModels: request.activeModels,
        targetAgreement: request.targetAgreement,
      },
      outgoing: {
        effectiveQuestion,
        historyTurns: Array.isArray(request.history)
          ? request.history.length
          : 0,
      },
      decision: "Request accepted and a new execution trace started.",
    }
  );

try {
    recordFlowStep(
    flowTraceId,
    "2. Query validation",
    "running",
    {
      sourceFile: "src/searchAndEnginePushRouter.ts",
      sourceFunction: "pushQueryToEnginesAndConverge",
      incoming: {
        queryChars: effectiveQuestion.length,
      },
    }
  );

  assertDefendedQuery(effectiveQuestion);

  recordFlowStep(
    flowTraceId,
    "2. Query validation",
    "ok",
    {
      sourceFile: "src/searchAndEnginePushRouter.ts",
      sourceFunction: "pushQueryToEnginesAndConverge",
      outgoing: {
        queryValidated: true,
      },
      decision: "The incoming query passed query-defense validation.",
    }
  );

const requestedModels = Array.isArray(request.activeModels)
  ? request.activeModels
      .map((model) => String(model || "").trim())
      .filter(Boolean)
  : [];

const modelsList = requestedModels;

// Stop execution if no AI engines were selected.
if (modelsList.length === 0) {
  recordFlowStep(
    flowTraceId,
    "2. Engine selection validation",
    "error",
    {
      sourceFile: "src/searchAndEnginePushRouter.ts",
      sourceFunction: "pushQueryToEnginesAndConverge",
      detail: "No engine is available for this request.",
      outgoing: {
        selectedEngineCount: 0,
      },
      decision: "Execution stopped because no AI engine was selected.",
    }
  );

  throw new Error(
    "No usable AI engine is available. Configure a provider before retrying."
  );
}

// Record successful engine selection.
recordFlowStep(
  flowTraceId,
  "2. Engine selection validation",
  "ok",
  {
    sourceFile: "src/searchAndEnginePushRouter.ts",
    sourceFunction: "pushQueryToEnginesAndConverge",
    outgoing: {
      selectedEngineCount: modelsList.length,
      selectedEngines: modelsList,
    },
    decision: "The requested AI engine selection passed validation.",
  }
);

    const safeTarget = Math.max(
    0,
    Math.min(
      100,
      typeof request.targetAgreement === "number" &&
        Number.isFinite(request.targetAgreement)
        ? request.targetAgreement
        : 95
    )
  );
  
    
    // Local consensus execution path.
// Pass the same trace ID into the consensus engine so its internal
// processing events belong to this request's execution trace.
const loopResult = await runSmartMemoryConsensusLoop(
  effectiveQuestion,
  request.history || [],
  modelsList,
  safeTarget,
  {
    buildAppMode: Boolean(request.buildAppMode),
    adminUpgradeMode: Boolean(request.adminUpgradeMode),
    nextVersionTag: request.nextVersionTag || "key",
    attachments: request.attachments || [],
    strictQueryPriority: request.strictQueryPriority,
    flowTraceId,
  }
);

    
   const response = executeConsensusApiPayload(
    loopResult,
    effectiveQuestion,
    modelsList,
    safeTarget,
    null
  );

  const finalAnswer = String(loopResult.finalAnswer || "").trim();

   // Step 3: Handle a missing final response.
  if (!finalAnswer) {
    recordFlowStep(
      flowTraceId,
      "3. Multi-Engine Consensus & Convergence",
      "error",
      {
        sourceFile: "src/consensusEngine.ts",
        sourceFunction: "runSmartMemoryConsensusLoop",
        durationMs: Date.now() - startedAt,
        incoming: {
          selectedEngines: modelsList,
          targetAgreement: safeTarget,
        },
        outgoing: {
          status: "error",
          outputChars: 0,
          achievedAgreement:
            loopResult.achievedAgreement ?? null,
          roundsExecuted:
            loopResult.iterationsRequired ?? null,
        },
        decision: "The consensus loop returned no final answer.",
      }
    );

    throw new Error(
      "The consensus engine returned no final answer."
    );
  }

  // Determine the actual consensus trace status.
  const finalTraceStatus: "ok" | "error" =
    loopResult.conformityReached === false ? "error" : "ok";

  // Step 3: Record the completed consensus result.
  recordFlowStep(
    flowTraceId,
    "3. Multi-Engine Consensus & Convergence",
    finalTraceStatus,
    {
      sourceFile: "src/consensusEngine.ts",
      sourceFunction: "runSmartMemoryConsensusLoop",
      durationMs: Date.now() - startedAt,
      incoming: {
        selectedEngines: modelsList,
        targetAgreement: safeTarget,
        promptProvided: effectiveQuestion,
      },
      outgoing: {
        achievedAgreement:
          loopResult.achievedAgreement ?? null,
        targetAgreement: safeTarget,
        roundsExecuted:
          loopResult.iterationsRequired ?? null,
        selectedEngineCount: modelsList.length,
        conformityReached:
          typeof loopResult.conformityReached === "boolean"
            ? loopResult.conformityReached
            : null,
        finalAnswerSnippet:
          finalAnswer.length > 200
            ? `${finalAnswer.slice(0, 200)}…`
            : finalAnswer,
        finalAnswerChars: finalAnswer.length,
      },
      decision:
        loopResult.conformityReached === false
          ? "A final response was returned, but fulfillment conformity was not reached."
          : loopResult.conformityReached === true
            ? "The consensus result passed fulfillment conformity."
            : "A final response was returned; fulfillment conformity was not reported.",
    }
  );

  // Step 4: Record the response payload return.
  recordFlowStep(
    flowTraceId,
    "4. Response Payload Return",
    "ok",
    {
      sourceFile: "src/searchAndEnginePushRouter.ts",
      sourceFunction: "pushQueryToEnginesAndConverge",
      incoming: {
        responseFieldCount: Object.keys(response).length,
      },
      outgoing: {
        responsePayloadReturned: true,
      },
      decision:
        "The consensus API response payload was returned to the calling function. HTTP delivery is handled by the caller.",
    }
  );

  finishFlowTrace(flowTraceId, finalTraceStatus);
  return response;
} catch (error) {
  recordFlowStep(
    flowTraceId,
    "Consensus pipeline failed",
    "error",
    {
      sourceFile: "src/searchAndEnginePushRouter.ts",
      sourceFunction: "pushQueryToEnginesAndConverge",
      durationMs: Date.now() - startedAt,
      outgoing: {
        status: "error",
      },
    }
  );

  finishFlowTrace(flowTraceId, "error");
  throw error;
}
}

export {
  CANDIDATE_MODELS,
  getAvailableCandidateModels,
  markModelCooldown,
  isQuotaOrRateLimitError,
  fetchGoogleSearchGrounding,
  runMemoryOperatingSystemPipeline,
  purgeAndIsolateContext,
  executeConsensus,
  executeConsensusApiPayload,
  runSmartMemoryConsensusLoop,
  GoogleGenAI,
  Type,
};
