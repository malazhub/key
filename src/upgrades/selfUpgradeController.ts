import fs from "fs";
import path from "path";
import os from "os";
import { exec } from "child_process";
import { promisify } from "util";
import crypto from "crypto";
import { detectCapabilityLoss, type CapabilityTestResult } from "./upgradeTransaction";
import { resolveKeyWorkspaceRoot } from "./workspace";

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

function assertSafeRelativePath(filePath: string): string {
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

  // Baseline capability gate.
  const baselineLint = await runCheck(activeRoot, "npm run lint");

  const baselineBuild = baselineLint.ok
    ? await runCheck(activeRoot, "npm run build")
    : {
        ok: false,
        output:
          "Baseline lint failed; refusing to replace a known-good active version.",
      };

  const baselineSelfTest = baselineBuild.ok
    ? await runCheck(
        activeRoot,
        "node --import tsx --input-type=module -e \"import { run_self_tests } from './src/upgrades/version8Harness.ts'; const r = await run_self_tests(); if (!r.passed) process.exit(1); console.log(JSON.stringify({ passed_checks: r.passed_checks, total_checks: r.total_checks }));\""
      )
    : { ok: false, output: "Baseline build failed; self-test was not executed." };

  const baselineSelfDiagnosis = baselineBuild.ok
    ? await runSelfDiagnosis(activeRoot)
    : { ok: false, output: "Baseline build failed; self-diagnosis was not executed." };

  if (!baselineLint.ok || !baselineBuild.ok || !baselineSelfTest.ok || !baselineSelfDiagnosis.ok) {
    throw new Error(
      `Active version failed its baseline capability gate. Lint=${baselineLint.ok}, Build=${baselineBuild.ok}, SelfTest=${baselineSelfTest.ok}, SelfDiagnosis=${baselineSelfDiagnosis.ok}.`
    );
  }

  const baselineCapabilities: CapabilityTestResult[] = [
    { id: "lint", passed: baselineLint.ok },
    { id: "build", passed: baselineBuild.ok },
    { id: "self-test", passed: baselineSelfTest.ok },
    { id: "self-diagnosis", passed: baselineSelfDiagnosis.ok },
  ];

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

  for (let round = 1; round <= requestedRounds; round += 1) {
    let candidate: SelfUpgradeRoundCandidate;
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

      fs.mkdirSync(path.dirname(candidateFile), { recursive: true });

      fs.writeFileSync(
        candidateFile,
        String(candidate.fileContent),
        "utf8"
      );

      const lint = await runCheck(
        candidateWorkspace,
        "npm run lint"
      );

      if (!lint.ok) {
        const error = summarizeFailure(
          lint,
          { ok: true, output: "" }
        );

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
          error,
        });

        previousFailure = error;
        previousCandidate = candidate;

        session.completedRounds = round;
        session.updatedAt = new Date().toISOString();

        persistSession(session);
        continue;
      }

      const build = await runCheck(
        candidateWorkspace,
        "npm run build"
      );

      const selfTest = await runCheck(
        candidateWorkspace,
        "node --import tsx --input-type=module -e \"import { run_self_tests } from './src/upgrades/version8Harness.ts'; const r = await run_self_tests(); if (!r.passed) process.exit(1); console.log(JSON.stringify({ passed_checks: r.passed_checks, total_checks: r.total_checks }));\""
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

      if (lostCapabilities.length > 0 || conformityScore < conformityTarget) {
        const error =
          lostCapabilities.length > 0
            ? `OLD PASS + NEW FAIL: ${lostCapabilities.join(", ")}. Latest successful candidate retained; trying next round.`
            : `Conformity ${conformityScore}% is below the selected ${conformityTarget}% target. Latest successful candidate retained; trying next round.`;

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
      if (conformityScore < conformityTarget) {
        previousFailure = `Conformity ${conformityScore}% < target ${conformityTarget}%.`;
        previousCandidate = candidate;
        session.completedRounds = round;
        session.updatedAt = new Date().toISOString();
        persistSession(session);
        continue;
      }

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
          lint: true,
          build: true,
          selfTest: true,
          selfDiagnosis: true,
        },
        conformityScore: 100,
        generated,
        deployed: false,
        successfulCandidate: true,

        // Persist actual generated source.
        stagedFileContent: String(candidate.fileContent),

        // Persist built preview information.
        previewHtml,
        previewReady: Boolean(previewHtml),
      });

      session.updatedAt = new Date().toISOString();

      persistSession(session);

      // IMPORTANT:
      // deploy=false NEVER activates the candidate.
      // It only records the successful candidate and continues
      // the cumulative upgrade loop.
      if (!request.deploy) {
        // A verified conformity result is terminal for this campaign:
        // keep the exact cumulative runtime candidate and stop immediately.
        previousFailure = "";
        previousCandidate = candidate;
        session.status = "PENDING_ADMIN_DECISION";
        session.updatedAt = new Date().toISOString();
        persistSession(session);
        break;
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
