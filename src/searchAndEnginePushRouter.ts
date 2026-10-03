/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Key — Live Web Search, 5-Channel Memory Search & Multi-Engine Query Push Router
 * File: src/searchAndEnginePushRouter.ts
 */

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
  liveStructureContext?: string;
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
  options?: { forceIsolated?: boolean }
): Promise<{
  webSearchSources: GroundingSource[];
  memorySearchTrace: MemoryOSPipelineTrace;
}> {
  const cleanQuestion = String(question || "").trim();

  const memorySearchTrace = runMemoryOperatingSystemPipeline(
    cleanQuestion,
    history,
    { forceIsolated: options?.forceIsolated }
  );

  if (!cleanQuestion) {
    return {
      webSearchSources: [],
      memorySearchTrace,
    };
  }

  const webSearchSources = await fetchGoogleSearchGrounding(cleanQuestion);
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
export async function pushQueryToEnginesAndConverge(
  request: SearchAndEnginePushRequest
): Promise<Record<string, any>> {
  const effectiveQuestion = String(request.question || "").trim();
  const modelsList =
    Array.isArray(request.activeModels) && request.activeModels.length > 0
      ? request.activeModels
      : [
          "ChatGPT 4o",
          "Claude 3.5 Sonnet",
          "DeepSeek V3",
          "Gemini 2.5",
          "Qwen 2.5",
          "Llama 3.3 70B",
          "Grok 2",
          "Mistral Large 2",
          "Perplexity Pro",
          "Command R+",
        ];
  const safeTarget = Math.max(
    1,
    Math.min(100, Number(request.targetAgreement) || 95)
  );

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
      liveStructureContext: request.liveStructureContext,
    }
  );

  return executeConsensusApiPayload(
    loopResult,
    effectiveQuestion,
    modelsList,
    safeTarget,
    null
  );
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
