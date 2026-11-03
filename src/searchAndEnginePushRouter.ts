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
import {
  readGitHubRepository,
  type GitHubRepositoryReadResult,
} from "./githubRepositoryReader";
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

  // Optional explicit repository reference.
  repositoryReference?: string;
}
export interface SearchAndEnginePushResult {
  queryDispatchedToEngines: string;
  strictQueryPriority: boolean;
  contextMode: "NEW_QUERY_ONLY" | "MERGED_WITH_SAVED";
  historyMatchScore: number;
  discoverySources: GroundingSource[];
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
function detectGitHubRepositoryReference(
  question: string,
  explicitReference?: string,
): string | null {
  if (explicitReference?.trim()) {
    return explicitReference.trim();
  }

  const match = question.match(
    /https?:\/\/github\.com\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+(?:\.git)?(?:\/tree\/[^/?#\s]+)?/i,
  );

  return match?.[0] || null;
}
/**
 * STEP 1: 5-Channel Parallel Memory Search + Context Preparation.
 *
 * This function does NOT perform live Google Search grounding. Live web
 * retrieval happens inside the consensus pipeline
 * (runSmartMemoryConsensusLoop → fetchGoogleSearchGrounding →
 * fetchVerifiedExternalEvidence).
 *
 * `discoverySources` is currently always empty. It is preserved on the
 * return shape so callers can distinguish "memory-only retrieval" from
 * "memory + grounded-evidence retrieval" without changing signatures.
 *
 * Discovery is not verified evidence. An empty discovery array must never
 * be presented to the user as evidence.
 */
export async function executeKeySearchPipeline(
  question: string,
  history: HistoryTurn[] = [],
  options?: {
    forceIsolated?: boolean;
    flowTraceId?: string;
  }
): Promise<{
  discoverySources: GroundingSource[];
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
      discoverySources: [],
      memorySearchTrace,
    };
  }

  const discoverySources: GroundingSource[] = [];

  if (traceId) {
    recordFlowStep(
      traceId,
      "Search pipeline completed",
      "ok",
      {
        sourceFile: "src/searchAndEnginePushRouter.ts",
        sourceFunction: "executeKeySearchPipeline",
        outgoing: {
          discoverySourceCount: discoverySources.length,
        },
      }
    );
  }

  return {
    discoverySources,
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
  
// ============================================================
// STEP 3A: UNIVERSAL GITHUB REPOSITORY RETRIEVAL
// ============================================================

const repositoryReference =
  detectGitHubRepositoryReference(
    effectiveQuestion,
    request.repositoryReference,
  );
let repositoryResultForAudit:
  | GitHubRepositoryReadResult
  | null = null;
const repositoryAttachments: IncomingAttachment[] = [];

if (repositoryReference) {
  recordFlowStep(
    flowTraceId,
    "3A. GitHub repository retrieval",
    "running",
    {
      sourceFile: "src/githubRepositoryReader.ts",
      sourceFunction: "readGitHubRepository",
      incoming: {
        repositoryReference,
      },
      decision:
        "A GitHub repository reference was detected. Retrieving repository evidence before consensus.",
    },
  );

  const repositoryResult: GitHubRepositoryReadResult =
    await readGitHubRepository(repositoryReference);
repositoryResultForAudit = repositoryResult;
  const metadata = repositoryResult.metadata;

  // Preserve the repository tree as a machine-readable manifest.
  const treeManifest = repositoryResult.tree
    .map((entry) =>
      `${entry.type}\t${entry.path}\t${entry.sha}`,
    )
    .join("\n");

  const repositoryManifest = [
    "# GitHub Repository Evidence",
    "",
    `Status: ${repositoryResult.status}`,
    `Repository: ${metadata?.fullName || repositoryReference}`,
    `Description: ${metadata?.description || "Not available"}`,
    `Private: ${metadata?.private ?? "Unknown"}`,
    `Default branch: ${metadata?.defaultBranch || "Unknown"}`,
    `Requested reference: ${metadata?.requestedRef || "Unknown"}`,
    `Commit SHA: ${metadata?.commitSha || "Unknown"}`,
    `Repository URL: ${metadata?.htmlUrl || repositoryReference}`,
    `Tree complete: ${repositoryResult.treeComplete}`,
`Inspection complete: ${repositoryResult.inspectionComplete}`,
`Retrieval status: ${repositoryResult.status}`,
`Total tree entries: ${repositoryResult.totalTreeEntries}`,
`Total blob entries: ${repositoryResult.totalBlobEntries}`,
`Eligible source files: ${repositoryResult.eligibleFileCount}`,
`Downloaded and verified files: ${repositoryResult.downloadedFiles}`,
`Failed files: ${repositoryResult.failedPaths.length}`,
`Skipped files: ${repositoryResult.skippedPaths.length}`,
    "",
    "## Complete retrieved file tree",
    "",
    treeManifest || "No tree entries retrieved.",
    "",
    "## Failed paths",
"",
repositoryResult.failedPaths.join("\n") || "None",
"",
"## Skipped paths",
"",
repositoryResult.skippedPaths
  .map(
    (item) =>
      `${item.path}: ${item.reason}`,
  )
  .join("\n") || "None",
"",
"## Retrieval errors",
"",
repositoryResult.errors.join("\n") || "None",
"",
"## Mandatory inspection disclosure",
"",
repositoryResult.inspectionComplete
  ? "All repository tree entries and file contents were retrieved and verified."
  : "INSPECTION INCOMPLETE. Do not claim that the repository was fully inspected. Explicitly disclose all failed and skipped paths.",
    "",
    "IMPORTANT: Do not claim that files were inspected unless their contents were successfully retrieved.",
  ].join("\n");

  repositoryAttachments.push({
    name: "GITHUB_REPOSITORY_MANIFEST.md",
    mimeType: "text/markdown",
    kind: "file",
    textContent: repositoryManifest,
    sizeBytes: Buffer.byteLength(repositoryManifest, "utf8"),
  });

  // Send the actual retrieved source contents to the engines.
  for (const file of repositoryResult.files) {
    repositoryAttachments.push({
      name: file.path,
      mimeType: "text/plain",
      kind: "file",
      textContent: file.content,
      sizeBytes: file.size,
    });
  }

  recordFlowStep(
    flowTraceId,
    "3A. GitHub repository retrieval",
    repositoryResult.status === "complete" ? "ok" : "error",
    {
      sourceFile: "src/githubRepositoryReader.ts",
      sourceFunction: "readGitHubRepository",
      outgoing: {
        repository: metadata?.fullName || null,
        status: repositoryResult.status,
        treeEntries: repositoryResult.totalTreeEntries,
        downloadedFiles: repositoryResult.downloadedFiles,
        failedFiles: repositoryResult.failedPaths.length,
        treeTruncated: repositoryResult.treeTruncated,
      },
      decision:
        repositoryResult.status === "complete"
          ? "Repository metadata, tree and selected source files were retrieved."
          : "Repository retrieval was incomplete. The engines must be informed of the retrieval limitations.",
    },
  );
}

// Keep existing user attachments and append repository evidence.
// The original consensus engine remains responsible for all rounds.
const consensusAttachments: IncomingAttachment[] = [
  ...(request.attachments || []),
  ...repositoryAttachments,
];

  
    
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
    attachments: consensusAttachments,
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
if (
  repositoryResultForAudit &&
  !repositoryResultForAudit.inspectionComplete
) {
  const repositoryAudit = repositoryResultForAudit;

  const failedReport =
    repositoryAudit.failedPaths.length > 0
      ? repositoryAudit.failedPaths
          .map((path) => `- ${path}`)
          .join("\n")
      : "None";

  const skippedReport =
    repositoryAudit.skippedPaths.length > 0
      ? repositoryAudit.skippedPaths
          .map(
            (item) =>
              `- ${item.path}: ${item.reason}`,
          )
          .join("\n")
      : "None";

  const errorReport =
    repositoryAudit.errors.length > 0
      ? repositoryAudit.errors
          .map((error) => `- ${error}`)
          .join("\n")
      : "None";

  const authoritativeDisclosure = [
    "## Repository inspection status: INCOMPLETE",
    "",
    "The repository was not fully inspected. Do not interpret this response as confirmation that every repository file was retrieved or examined.",
    "",
    `Repository: ${repositoryAudit.metadata?.fullName || "Unknown"}`,
    `Commit: ${repositoryAudit.metadata?.commitSha || "Unknown"}`,
    `Tree complete: ${repositoryAudit.treeComplete}`,
    `Total tree entries: ${repositoryAudit.totalTreeEntries}`,
    `Total file entries: ${repositoryAudit.totalBlobEntries}`,
    `Files downloaded and verified: ${repositoryAudit.downloadedFiles}`,
    "",
    "### Files that could not be retrieved",
    "",
    failedReport,
    "",
    "### Files deliberately not retrieved",
    "",
    skippedReport,
    "",
    "### Retrieval errors",
    "",
    errorReport,
    "",
    "The missing or skipped files have not been inspected. Conclusions that depend on those files remain unverified.",
  ].join("\n");

  response.finalAnswer = [
    finalAnswer,
    authoritativeDisclosure,
  ]
    .filter(Boolean)
    .join("\n\n");

  response.answer = response.finalAnswer;

  response.repositoryInspection = {
    status: repositoryAudit.status,
    treeComplete: repositoryAudit.treeComplete,
    inspectionComplete: false,
    totalTreeEntries: repositoryAudit.totalTreeEntries,
    totalBlobEntries: repositoryAudit.totalBlobEntries,
    downloadedFiles: repositoryAudit.downloadedFiles,
    failedPaths: repositoryAudit.failedPaths,
    skippedPaths: repositoryAudit.skippedPaths,
    errors: repositoryAudit.errors,
  };
} else if (repositoryResultForAudit) {
  response.repositoryInspection = {
    status: repositoryResultForAudit.status,
    treeComplete: true,
    inspectionComplete: true,
    totalTreeEntries: repositoryResultForAudit.totalTreeEntries,
    totalBlobEntries: repositoryResultForAudit.totalBlobEntries,
    downloadedFiles: repositoryResultForAudit.downloadedFiles,
    failedPaths: [],
    skippedPaths: [],
    errors: [],
  };
}
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
