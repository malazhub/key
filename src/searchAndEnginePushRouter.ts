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

  const webSearchSources =
    await fetchGoogleSearchGrounding(cleanQuestion);

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
function extractGitHubRepo(
  input: string
): { owner: string; repo: string } | null {
  const normalized = input.replace(/\\/g, "/");

  const match = normalized.match(
    /(?:https?:\/\/)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/
  );

  if (!match) return null;

  return {
    owner: match[1],
    repo: match[2].replace(/\.git$/i, ""),
  };
}

function wantsArchitectureTree(input: string): boolean {
  return /\b(tree|directory|directories|folder|folders|structure|architecture|file layout)\b/i.test(
    input
  );
}

async function getVerifiedArchitectureTree(
  question: string
): Promise<{
  answer: string;
  repositoryEvidence: {
    repository: string;
    defaultBranch: string;
    commitSha: string;
    fileCount: number;
  };
} | null> {
  if (!wantsArchitectureTree(question)) return null;

  const repo = extractGitHubRepo(question);
  if (!repo) return null;

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
  };

  // Optional: set GITHUB_TOKEN in the server environment to avoid
  // unauthenticated API rate limits.
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const baseUrl =
    `https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}`;

  const repoResponse = await fetch(baseUrl, { headers });

  if (!repoResponse.ok) {
    throw new Error(
      `GitHub repository lookup failed: HTTP ${repoResponse.status}`
    );
  }

  const repoData = await repoResponse.json();

  const defaultBranch = String(repoData.default_branch || "");
  if (!defaultBranch) {
    throw new Error("GitHub did not return a default branch.");
  }

  const branchResponse = await fetch(
    `${baseUrl}/branches/${encodeURIComponent(defaultBranch)}`,
    { headers }
  );

  if (!branchResponse.ok) {
    throw new Error(
      `GitHub branch lookup failed: HTTP ${branchResponse.status}`
    );
  }

  const branchData = await branchResponse.json();
  const commitSha = String(branchData.commit?.sha || "");

  if (!commitSha) {
    throw new Error("GitHub did not return the branch commit SHA.");
  }

  const treeResponse = await fetch(
    `${baseUrl}/git/trees/${encodeURIComponent(commitSha)}?recursive=1`,
    { headers }
  );

  if (!treeResponse.ok) {
    throw new Error(
      `GitHub tree lookup failed: HTTP ${treeResponse.status}`
    );
  }

  const treeData = await treeResponse.json();

  // Never claim a complete tree if GitHub says it was truncated.
  if (treeData.truncated === true) {
    throw new Error(
      "GitHub returned a truncated tree; refusing to claim completeness."
    );
  }

  if (!Array.isArray(treeData.tree)) {
    throw new Error("GitHub returned an invalid tree response.");
  }

  const paths: string[] = treeData.tree
    .filter(
      (entry: { type?: string; path?: string }) =>
        entry.type === "blob" && typeof entry.path === "string"
    )
    .map((entry: { path: string }) => entry.path)
    .sort((a: string, b: string) => a.localeCompare(b));

  const lines = [
    `${repo.owner}/${repo.repo}`,
    `Branch: ${defaultBranch}`,
    `Commit: ${commitSha}`,
    "",
    ...paths.map((path: string) => `  ${path}`),
  ];

  return {
    answer: [
      `## Repository tree: ${repo.owner}/${repo.repo}`,
      "",
      `- Default branch: \`${defaultBranch}\``,
      `- Commit: \`${commitSha}\``,
      `- Files returned by GitHub: ${paths.length}`,
      "",
      "```text",
      ...lines,
      "```",
      "",
      `Source: https://github.com/${repo.owner}/${repo.repo}/tree/${commitSha}`,
    ].join("\n"),
    repositoryEvidence: {
      repository: `${repo.owner}/${repo.repo}`,
      defaultBranch,
      commitSha,
      fileCount: paths.length,
    },
  };
}
export async function pushQueryToEnginesAndConverge(
  request: SearchAndEnginePushRequest
): Promise<Record<string, any>> {
 const startedAt = Date.now();
const effectiveQuestion = String(request.question || "").trim();
const flowTraceId = startFlowTrace(effectiveQuestion);

recordFlowStep(
  flowTraceId,
  "Request received",
  "ok",
  {
    sourceFile: "src/searchAndEnginePushRouter.ts",
    sourceFunction: "pushQueryToEnginesAndConverge",
    incoming: {
      queryChars: effectiveQuestion.length,
    },
  }
);

try {
  recordFlowStep(
    flowTraceId,
    "Query validation",
    "running",
    {
      sourceFile: "src/searchAndEnginePushRouter.ts",
      sourceFunction: "pushQueryToEnginesAndConverge",
    }
  );

 
assertDefendedQuery(effectiveQuestion);

if (wantsArchitectureTree(effectiveQuestion)) {
  if (!extractGitHubRepo(effectiveQuestion)) {
    throw new Error(
      "A valid GitHub repository URL is required."
    );
  }

  const architectureResult =
    await getVerifiedArchitectureTree(effectiveQuestion);

  if (!architectureResult) {
    throw new Error(
      "GitHub verification failed. Refusing to invent repository architecture."
    );
  }

  recordFlowStep(
    flowTraceId,
    "GitHub repository tree fetched",
    "ok",
    {
      sourceFile: "src/searchAndEnginePushRouter.ts",
      sourceFunction: "pushQueryToEnginesAndConverge",
      outgoing: architectureResult.repositoryEvidence,
    }
  );

  finishFlowTrace(flowTraceId, "ok");

  return {
    finalAnswer: architectureResult.answer,
    answer: architectureResult.answer,
    achievedAgreement: 0,
    iterationsRequired: 0,
    activeModels: [],
    nodeContributions: [],
    webSearchSources: [],
    repositoryEvidence: architectureResult.repositoryEvidence,
    verification: {
      passed: true,
      method: "GitHub API tree and commit SHA",
    },
  };
}

recordFlowStep(
  flowTraceId,
  "Query validation",
  "ok",
  {
    sourceFile: "src/searchAndEnginePushRouter.ts",
    sourceFunction: "pushQueryToEnginesAndConverge",
  }
);


  const modelsList = Array.isArray(request.activeModels)
    ? request.activeModels
        .map((model) => String(model || "").trim())
        .filter(Boolean)
    : [];

  if (modelsList.length === 0) {
    recordFlowStep(
      flowTraceId,
      "Engine selection validation",
      "error",
      {
        sourceFile: "src/searchAndEnginePushRouter.ts",
        sourceFunction: "pushQueryToEnginesAndConverge",
        detail: "No engine has been selected",
      }
    );

    throw new Error(
      "No engine has been selected. Choose at least one engine slot."
    );
  }

  recordFlowStep(
    flowTraceId,
    "Engine selection validation",
    "ok",
    {
      sourceFile: "src/searchAndEnginePushRouter.ts",
      sourceFunction: "pushQueryToEnginesAndConverge",
      outgoing: {
        engineCount: modelsList.length,
      },
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

  if (!finalAnswer) {
    recordFlowStep(
      flowTraceId,
      "Final response assembly",
      "error",
      {
        sourceFile: "src/searchAndEnginePushRouter.ts",
        sourceFunction: "pushQueryToEnginesAndConverge",
        durationMs: Date.now() - startedAt,
        detail: "The consensus loop returned an empty final answer.",
        outgoing: {
          status: "error",
          outputChars: 0,
          achievedAgreement: loopResult.achievedAgreement,
          iterationsRequired: loopResult.iterationsRequired,
        },
      }
    );

    throw new Error(
      "The consensus engine returned no final answer."
    );
  }

  recordFlowStep(
    flowTraceId,
    "Final response assembly",
    "ok",
    {
      sourceFile: "src/searchAndEnginePushRouter.ts",
      sourceFunction: "pushQueryToEnginesAndConverge",
      durationMs: Date.now() - startedAt,
      outgoing: {
        status: "ok",
        outputChars: finalAnswer.length,
        achievedAgreement: loopResult.achievedAgreement,
        iterationsRequired: loopResult.iterationsRequired,
        activeEngineCount: modelsList.length,
      },
    }
  );

  finishFlowTrace(flowTraceId, "ok");
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
