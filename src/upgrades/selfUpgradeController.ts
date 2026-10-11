import fs from "fs";
import path from "path";
import os from "os";
import { exec } from "child_process";
import { promisify } from "util";
import crypto from "crypto";
import { detectCapabilityLoss, type CapabilityTestResult } from "./upgradeTransaction";
import { resolveKeyWorkspaceRoot } from "./workspace";
import { verifyFileWrite } from "./evidenceGuard";

const execAsync = promisify(exec);

export type SelfUpgradeRoundCandidate = {
  filePath: string;
  fileContent: string;
};

export type SelfUpgradeCandidateGenerator = (params: {
  round: number;
  instruction: string;
  activeWorkspace: string;
  previousFailure?: string;
  previousCandidate?: SelfUpgradeRoundCandidate;
}) => Promise<SelfUpgradeRoundCandidate>;

export type SelfUpgradeSessionStatus =
  | "COMPLETED"
  | "EXHAUSTED"
  | "STOPPED"
  | "FAILED"
  | "PENDING_ADMIN_DECISION";

export interface SelfUpgradeControllerRequest {
  instruction: string;
  requestedRounds: number;
  conformityTarget?: number;
  candidates?: SelfUpgradeRoundCandidate[];
  deploy: boolean;
  workspaceRoot?: string;
}

export interface SelfUpgradeRoundResult {
  round: number;
  candidatePath: string;
  candidateWorkspace: string;
  checks: {
    lint: boolean;
    build: boolean;
    selfTest: boolean;
    selfDiagnosis: boolean;
  };
  conformityScore: number;
  generated: boolean;
  deployed: boolean;
  deployment?: Record<string, unknown>;
  error?: string;
  stagedFileContent?: string;
  previewHtml?: string;
  previewReady?: boolean;
  successfulCandidate?: boolean;
  readBackVerified?: boolean;
  intendedFileChanged?: boolean;
  failureReason?: string;
}

export interface SelfUpgradeSession {
  sessionId: string;
  instruction: string;
  requestedRounds: number;
  conformityTarget: number;
  completedRounds: number;
  status: SelfUpgradeSessionStatus;
  workspaceRoot: string;
  startedAt: string;
  updatedAt: string;
  rounds: SelfUpgradeRoundResult[];

  // These identify the exact final successful candidate.
  finalRound?: number;
  finalCandidatePath?: string;
  finalCandidateWorkspace?: string;
}

type DeployFn = (args: {
  githubToken?: string;
  repoOwner?: string;
  repoName?: string;
  branch?: string;
  forceRebuild?: boolean;
  sourceWorkspace?: string;
}) => Promise<Record<string, unknown>>;

function safeSessionId(): string {
  return `upgrade_${new Date().toISOString().replace(/[:.]/g, "-")}_${crypto
    .randomBytes(4)
    .toString("hex")}`;
}

export function assertSafeRelativePath(filePath: string): string {
  const clean = String(filePath || "").trim().replace(/^[/\\]+/, "");

  if (!clean || path.isAbsolute(clean)) {
    throw new Error("Candidate file path is required.");
  }

  const normalized = path.posix.normalize(clean.replace(/\\/g, "/"));

  if (
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.includes("/../")
  ) {
    throw new Error(
      "Candidate file path may not escape the upgrade workspace."
    );
  }

  if (normalized.startsWith(".git/") || normalized === ".git") {
    throw new Error("Git metadata is not a candidate file.");
  }

  if (
    normalized.startsWith(".github/") ||
    normalized === "package.json" ||
    normalized === "package-lock.json" ||
    normalized === "pnpm-lock.yaml" ||
    normalized === "yarn.lock" ||
    normalized.startsWith(".env")
  ) {
    throw new Error(
      "Upgrade candidate may not modify deployment, dependency, or secret configuration."
    );
  }

  if (!(normalized === "server.ts" || normalized.startsWith("src/"))) {
    throw new Error(
      "Upgrade candidate must target server.ts or a file under src/."
    );
  }

  return normalized;
}

function copyWorkspace(sourceRoot: string, targetRoot: string): void {
  fs.mkdirSync(targetRoot, { recursive: true });

  const skip = new Set([
    ".git",
    "node_modules",
    "dist",
    "upgrade-workspaces",
  ]);

  const copyTree = (src: string, dst: string) => {
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      if (skip.has(entry.name)) continue;

      const srcPath = path.join(src, entry.name);
      const dstPath = path.join(dst, entry.name);

      if (entry.isDirectory()) {
        fs.mkdirSync(dstPath, { recursive: true });
        copyTree(srcPath, dstPath);
      } else if (entry.isFile()) {
        fs.mkdirSync(path.dirname(dstPath), { recursive: true });
        fs.copyFileSync(srcPath, dstPath);
      }
    }
  };

  copyTree(sourceRoot, targetRoot);

  const sourceNodeModules = path.join(sourceRoot, "node_modules");
  const targetNodeModules = path.join(targetRoot, "node_modules");

  if (
    fs.existsSync(sourceNodeModules) &&
    !fs.existsSync(targetNodeModules)
  ) {
    fs.symlinkSync(
      sourceNodeModules,
      targetNodeModules,
      os.platform() === "win32" ? "junction" : "dir"
    );
  }
}

function persistSession(session: SelfUpgradeSession): void {
  const dir = path.join(session.workspaceRoot, "sessions");
  fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(
    path.join(dir, `${session.sessionId}.json`),
    JSON.stringify(session, null, 2),
    "utf8"
  );
}

async function runSelfDiagnosis(
  workspace: string
): Promise<{ ok: boolean; output: string }> {
  const diagnosisCommand =
    "node --import tsx --input-type=module -e " +
    JSON.stringify(
      "import fs from 'fs'; const required=['package.json','src/consensusEngine.ts','src/upgrades/version8Harness.ts','src/upgrades/selfUpgradeController.ts','dist/index.html']; const missing=required.filter(p=>!fs.existsSync(p)); if(missing.length){console.error('SELF_DIAGNOSIS_MISSING:'+missing.join(','));process.exit(1)}; const pkg=JSON.parse(fs.readFileSync('package.json','utf8')); if(!pkg.scripts?.build||!pkg.scripts?.lint){console.error('SELF_DIAGNOSIS_PACKAGE_SCRIPTS_MISSING');process.exit(1)}; console.log('SELF_DIAGNOSIS_OK')"
    );
  return runCheck(workspace, diagnosisCommand);
}

async function runCheck(
  workspace: string,
  command: string
): Promise<{ ok: boolean; output: string }> {
  try {
    const result = await execAsync(command, {
      cwd: workspace,
      timeout: 120000,
      maxBuffer: 8 * 1024 * 1024,
    });

    return {
      ok: true,
      output: `${result.stdout || ""}${result.stderr || ""}`.slice(-12000),
    };
  } catch (error) {
    const e = error as {
      stdout?: string;
      stderr?: string;
      message?: string;
    };

    return {
      ok: false,
      output: `${e.stdout || ""}${e.stderr || ""}${e.message || ""}`.slice(
        -12000
      ),
    };
  }
}

async function restoreFiles(
  activeRoot: string,
  backups: Map<string, string | null>
): Promise<void> {
  for (const [rel, previous] of backups) {
    const target = path.join(activeRoot, rel);

    if (previous === null) {
      try {
        fs.rmSync(target, { force: true });
      } catch {}
    } else {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, previous, "utf8");
    }
  }
}

function summarizeFailure(
  lint: { ok: boolean; output: string },
  build: { ok: boolean; output: string }
): string {
  if (!lint.ok) return `LINT FAILED:\n${lint.output}`;
  if (!build.ok) return `BUILD FAILED:\n${build.output}`;
  return "Candidate did not reach deployment.";
}

export async function runBoundedSelfUpgradeSession(
  request: SelfUpgradeControllerRequest,
  deps: {
    activeWorkspace: string;
    deploy: DeployFn;
    githubToken?: string;
    generateCandidate?: SelfUpgradeCandidateGenerator;
  }
): Promise<SelfUpgradeSession> {
  const requestedRounds = Number(request.requestedRounds);
  const conformityTarget = Number(request.conformityTarget ?? 100);

  if (
    !Number.isFinite(conformityTarget) ||
    conformityTarget < 1 ||
    conformityTarget > 100
  ) {
    throw new Error("conformityTarget must be a number from 1 to 100.");
  }

  if (
    !Number.isInteger(requestedRounds) ||
    requestedRounds < 1 ||
    requestedRounds > 50
  ) {
    throw new Error("requestedRounds must be an integer from 1 to 50.");
  }

  const explicitCandidates = Array.isArray(request.candidates)
    ? request.candidates
    : [];

  if (
    explicitCandidates.length > 0 &&
    explicitCandidates.length < requestedRounds
  ) {
    throw new Error(
      "When explicit candidates are supplied, provide one candidate for every requested round."
    );
  }

  if (
    explicitCandidates.length === 0 &&
    typeof deps.generateCandidate !== "function"
  ) {
    throw new Error(
      "No candidates supplied and no autonomous candidate generator is configured."
    );
  }

  const activeRoot = path.resolve(deps.activeWorkspace);

  const workspaceRoot = path.resolve(
    resolveKeyWorkspaceRoot(activeRoot).root
  );

  fs.mkdirSync(workspaceRoot, { recursive: true });

    
  // Run real checks on the starting workspace so capability comparisons
  // are based on actual results rather than assumed success.
  const baselineLint = await runCheck(activeRoot, "npm run lint");
  const baselineBuild = await runCheck(activeRoot, "npm run build");
  const baselineSelfTest = await runCheck(activeRoot, "npm run test:self");
  const baselineSelfDiagnosis = await runSelfDiagnosis(activeRoot);


  const baselineCapabilities: CapabilityTestResult[] = [
    { id: "lint", passed: baselineLint.ok },
    { id: "build", passed: baselineBuild.ok },
    { id: "self-test", passed: baselineSelfTest.ok },
    { id: "self-diagnosis", passed: baselineSelfDiagnosis.ok },
  ];
  if (
  !baselineLint.ok ||
  !baselineBuild.ok ||
  !baselineSelfTest.ok ||
  !baselineSelfDiagnosis.ok
) {
  session.status = "FAILED";
  session.updatedAt = new Date().toISOString();

  persistSession(session);
  return session;
}

  const session: SelfUpgradeSession = {
    sessionId: safeSessionId(),
    instruction: String(request.instruction || "").slice(0, 1000),
    requestedRounds,
    conformityTarget,
    completedRounds: 0,
    status: "FAILED",
    workspaceRoot,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    rounds: [],
  };

  persistSession(session);

  let previousFailure = "";
  let previousCandidate: SelfUpgradeRoundCandidate | undefined;

  // THIS is the critical cumulative state.
  // Every successful round becomes the source for the next round.
  const persistentRuntimeWorkspace = path.join(
    workspaceRoot,
    "active-runtime"
  );

  fs.mkdirSync(persistentRuntimeWorkspace, {
    recursive: true,
  });

  let latestSuccessfulWorkspace = fs.existsSync(
    path.join(persistentRuntimeWorkspace, "server.ts")
  )
    ? persistentRuntimeWorkspace
    : activeRoot;

  let latestSuccessfulCandidate:
    | SelfUpgradeRoundCandidate
    | undefined;

    const MAX_ROUNDS = 50; const maxRounds = Math.min(requestedRounds, MAX_ROUNDS);  for (let round = 1; round <= maxRounds; round += 1) {
    let candidate: SelfUpgradeRoundCandidate | undefined;
    let generated = false;

    try {
      if (explicitCandidates.length > 0) {
        candidate = explicitCandidates[round - 1];
      } else {
        candidate = await deps.generateCandidate!({
          round,
          instruction: session.instruction,

          // CRITICAL:
          // Round N+1 receives the latest successful Round N workspace.
          activeWorkspace: latestSuccessfulWorkspace,

          previousFailure,
          previousCandidate,
        });

        generated = true;
      }

      if (!candidate) throw new Error("Candidate generation returned no candidate.");
      const rel = assertSafeRelativePath(candidate.filePath);

      if (
        !candidate.fileContent ||
        candidate.fileContent.length > 1024 * 1024
      ) {
        throw new Error(
          "Candidate file content must be non-empty and <= 1 MiB."
        );
      }

      const candidateWorkspace = path.join(
        workspaceRoot,
        session.sessionId,
        `round-${round}`
      );

      fs.mkdirSync(candidateWorkspace, { recursive: true });

      // CRITICAL:
      // Copy from latest successful candidate, NOT original activeRoot.
      copyWorkspace(
        latestSuccessfulWorkspace,
        candidateWorkspace
      );

      const candidateFile = path.join(candidateWorkspace, rel);

      const expectedStagingContent = String(candidate.fileContent);

      fs.mkdirSync(path.dirname(candidateFile), { recursive: true });

      fs.writeFileSync(
        candidateFile,
        expectedStagingContent,
        "utf8"
      );

      const stagingCheck = await verifyFileWrite(
        candidateFile,
        expectedStagingContent
      );

      if (!stagingCheck.verified) {
        session.rounds.push({
          round,
          candidatePath: rel,
          candidateWorkspace,
          checks: {
            lint: false,
            build: false,
            selfTest: false,
            selfDiagnosis: false,
          },
          conformityScore: 0,
          generated,
          deployed: false,
          successfulCandidate: false,
          readBackVerified: false,
          intendedFileChanged: false,
          failureReason:
            `READBACK_MISMATCH_STAGING: ${rel}; ` +
            `expected ${stagingCheck.expectedLength} characters, ` +
            `read ${stagingCheck.actualLength} characters.`,
          error: `READBACK_MISMATCH_STAGING: ${rel}`,
        });

        previousFailure = `READBACK_MISMATCH_STAGING: ${rel}`;
        previousCandidate = candidate;

        session.completedRounds = round;
        session.updatedAt = new Date().toISOString();

        persistSession(session);
        continue;
      }

      
      // Run the real checks against this round's candidate workspace.
      const lint = await runCheck(candidateWorkspace, "npm run lint");
      const build = await runCheck(candidateWorkspace, "npm run build");
      const selfTest = await runCheck(
        candidateWorkspace,
        "npm run test:self"
      );
      const selfDiagnosis = await runSelfDiagnosis(candidateWorkspace);


        

      const conformityScore = Number(
        (((Number(lint.ok) + Number(build.ok) + Number(selfTest.ok) + Number(selfDiagnosis.ok)) / 4) * 100).toFixed(2)
      );

      const candidateCapabilities: CapabilityTestResult[] = [
        {
          id: "lint",
          passed: lint.ok,
        },
        {
          id: "build",
          passed: build.ok,
        },
        {
          id: "self-test",
          passed: selfTest.ok,
        },
        {
          id: "self-diagnosis",
          passed: selfDiagnosis.ok,
        },
      ];

      const lostCapabilities = detectCapabilityLoss(
        baselineCapabilities,
        candidateCapabilities
      );

      
      if (
        !lint.ok ||
        !build.ok ||
        !selfTest.ok ||
        !selfDiagnosis.ok ||
        lostCapabilities.length > 0 ||
        conformityScore < conformityTarget
      ) {
        const failedChecks = [
          !lint.ok ? `lint failed:\n${lint.output}` : "",
          !build.ok ? `build failed:\n${build.output}` : "",
          !selfTest.ok ? `self-test failed:\n${selfTest.output}` : "",
          !selfDiagnosis.ok
            ? `self-diagnosis failed:\n${selfDiagnosis.output}`
            : "",
        ].filter(Boolean);

        const error =
          failedChecks.length > 0
            ? failedChecks.join("\n\n")
            : lostCapabilities.length > 0
              ? `Capability regression: ${lostCapabilities.join(", ")}. Trying the next round.`
              : `Conformity ${conformityScore}% is below the selected ${conformityTarget}% target. Trying the next round.`;


        session.rounds.push({
          round,
          candidatePath: rel,
          candidateWorkspace,
          checks: {
            lint: lint.ok,
            build: build.ok,
            selfTest: selfTest.ok,
            selfDiagnosis: selfDiagnosis.ok,
          },
          conformityScore: conformityScore,
          generated,
          deployed: false,
          successfulCandidate: false,
          error,
        });

        previousFailure =
          `${error}\n${!lint.ok ? lint.output : ""}\n${
            !build.ok ? build.output : ""
          }`.slice(-12000);

        previousCandidate = candidate;

        session.completedRounds = round;
        session.updatedAt = new Date().toISOString();

        persistSession(session);
        continue;
      }

      if (!build.ok) {
        const error = summarizeFailure(lint, build);

        session.rounds.push({
          round,
          candidatePath: rel,
          candidateWorkspace,
          checks: {
            lint: true,
            build: false,
            selfTest: selfTest.ok,
            selfDiagnosis: selfDiagnosis.ok,
          },
          conformityScore: Number((100 / 3).toFixed(2)),
          generated,
          deployed: false,
          successfulCandidate: false,
          error,
        });

        previousFailure = error;
        previousCandidate = candidate;

        session.completedRounds = round;
        session.updatedAt = new Date().toISOString();

        persistSession(session);
        continue;
      }

      // ============================================================
      // A successful upgrade is a real conformity result, not a fabricated
      // score. The loop stops as soon as the selected target is actually met.
     

      // ============================================================
      // SUCCESSFUL ROUND
      // ============================================================

      latestSuccessfulWorkspace = candidateWorkspace;
      latestSuccessfulCandidate = candidate;

      const runtimeNext = path.join(
          workspaceRoot,
          "active-runtime-next"
        );

        fs.rmSync(runtimeNext, {
          recursive: true,
          force: true,
        });

        copyWorkspace(
          candidateWorkspace,
          runtimeNext
        );

        fs.rmSync(
          persistentRuntimeWorkspace,
          {
            recursive: true,
            force: true,
          }
        );

        fs.renameSync(
          runtimeNext,
          persistentRuntimeWorkspace
        );

        fs.writeFileSync(
          path.join(workspaceRoot, "active-runtime.json"),
          JSON.stringify(
            {
              runtimeWorkspace: persistentRuntimeWorkspace,
              sessionId: session.sessionId,
              sourceRound: round,
              updatedAt: new Date().toISOString(),
            },
            null,
            2
          ),
          "utf8"
        );

      session.finalRound = round;
      session.finalCandidatePath = rel;
      session.finalCandidateWorkspace = candidateWorkspace;
      session.completedRounds = round;

      let previewHtml = "";

      const previewIndex = path.join(
        candidateWorkspace,
        "dist",
        "index.html"
      );

      if (fs.existsSync(previewIndex)) {
        previewHtml = fs.readFileSync(
          previewIndex,
          "utf8"
        );
      }

      session.rounds.push({
        round,
        candidatePath: rel,
        candidateWorkspace,
        
        checks: {
          lint: lint.ok,
          build: build.ok,
          selfTest: selfTest.ok,
          selfDiagnosis: selfDiagnosis.ok,
        },
        conformityScore,

        generated,
        deployed: false,
        successfulCandidate: true,

        // Persist actual generated source.
        stagedFileContent: String(candidate.fileContent),

        // Persist built preview information.
        previewHtml,
        previewReady: Boolean(previewHtml),

        readBackVerified: true,
        intendedFileChanged: true,
      });

      session.updatedAt = new Date().toISOString();

      persistSession(session);

      // IMPORTANT:
      // deploy=false NEVER activates the candidate.
      // It only records the successful candidate and continues
      // the cumulative upgrade loop.
      if (!request.deploy) {
        previousFailure = "";
        previousCandidate = candidate;
        session.status = "PENDING_ADMIN_DECISION";
        session.updatedAt = new Date().toISOString();
        persistSession(session);
        continue;
      }

      // Legacy direct-deploy mode remains available.
      const target = path.join(activeRoot, rel);

      const backups = new Map<string, string | null>();

      backups.set(
        rel,
        fs.existsSync(target)
          ? fs.readFileSync(target, "utf8")
          : null
      );

      fs.mkdirSync(path.dirname(target), {
        recursive: true,
      });

      fs.copyFileSync(candidateFile, target);

      const liveCheck = await verifyFileWrite(
        target,
        expectedStagingContent
      );

      if (!liveCheck.verified) {
        await restoreFiles(activeRoot, backups);

        session.rounds[
          session.rounds.length - 1
        ] = {
          ...session.rounds[
            session.rounds.length - 1
          ],
          readBackVerified: false,
          intendedFileChanged: false,
          deployed: false,
          failureReason:
            `READBACK_MISMATCH_LIVE: ${rel}; ` +
            `expected ${liveCheck.expectedLength} characters, ` +
            `read ${liveCheck.actualLength} characters.`,
          error: `READBACK_MISMATCH_LIVE: ${rel}`,
        };

        previousFailure = `READBACK_MISMATCH_LIVE: ${rel}`;
        previousCandidate = candidate;

        session.updatedAt = new Date().toISOString();

        persistSession(session);
        continue;
      }

      const originalLiveContent = backups.get(rel) ?? null;

      const liveChanged =
        liveCheck.verified &&
        (originalLiveContent === null ||
          originalLiveContent !== expectedStagingContent);

      if (!liveChanged) {
        await restoreFiles(activeRoot, backups);

        session.rounds[
          session.rounds.length - 1
        ] = {
          ...session.rounds[
            session.rounds.length - 1
          ],
          readBackVerified: true,
          intendedFileChanged: false,
          deployed: false,
          failureReason: `LIVE_FILE_UNCHANGED: ${rel}`,
          error: `LIVE_FILE_UNCHANGED: ${rel}`,
        };

        previousFailure = `LIVE_FILE_UNCHANGED: ${rel}`;
        previousCandidate = candidate;

        session.updatedAt = new Date().toISOString();

        persistSession(session);
        continue;
      }

      session.rounds[
        session.rounds.length - 1
      ] = {
        ...session.rounds[
          session.rounds.length - 1
        ],
        readBackVerified: true,
        intendedFileChanged: true,
      };

      const deployment = await deps.deploy({
        githubToken: deps.githubToken,
        repoOwner: "malazhub",
        repoName: "key",
        branch: "main",
        forceRebuild: true,
      });

      if (
        deployment.success !== true ||
        deployment.verified !== true
      ) {
        await restoreFiles(activeRoot, backups);

        const error =
          "Deployment did not return verified=true; active workspace restored.";

        session.rounds[
          session.rounds.length - 1
        ] = {
          ...session.rounds[
            session.rounds.length - 1
          ],
          deployed: false,
          deployment,
          error,
        };

        previousFailure = error;
        previousCandidate = candidate;

        session.updatedAt = new Date().toISOString();

        persistSession(session);
        continue;
      }

      session.rounds[
        session.rounds.length - 1
      ] = {
        ...session.rounds[
          session.rounds.length - 1
        ],
        deployed: true,
        deployment,
      };

      session.status = "COMPLETED";
      session.updatedAt = new Date().toISOString();

      persistSession(session);

      return session;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      session.rounds.push({
        round,
        candidatePath: String(
          candidate?.filePath || "generation-error"
        ),
        candidateWorkspace: path.join(
          workspaceRoot,
          session.sessionId,
          `round-${round}`
        ),
        checks: {
          lint: false,
          build: false,
          selfTest: false,
          selfDiagnosis: false,
        },
        conformityScore: 0,
        generated,
        deployed: false,
        successfulCandidate: false,
        error: message,
      });

      previousFailure = message;
      previousCandidate = candidate;

      session.completedRounds = round;
      session.updatedAt = new Date().toISOString();

      persistSession(session);
    }
  }

  // The loop has now actually reached the requested round limit.
  //
  // If ANY successful candidate exists, retain it.
  // A failed final round therefore cannot destroy the last good candidate.
  if (
    latestSuccessfulCandidate &&
    session.finalCandidateWorkspace &&
    session.finalCandidatePath &&
    typeof session.finalRound === "number"
  ) {
    session.status = "PENDING_ADMIN_DECISION";
  } else {
    session.status = "EXHAUSTED";
  }

  session.updatedAt = new Date().toISOString();

  persistSession(session);

  return session;
}
