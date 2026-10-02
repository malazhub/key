import fs from "fs";
import path from "path";
import os from "os";
import { exec } from "child_process";
import { promisify } from "util";
import crypto from "crypto";

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
  };
  generated: boolean;
  deployed: boolean;
  deployment?: Record<string, unknown>;
  error?: string;
}

export interface SelfUpgradeSession {
  sessionId: string;
  instruction: string;
  requestedRounds: number;
  completedRounds: number;
  status: SelfUpgradeSessionStatus;
  workspaceRoot: string;
  startedAt: string;
  updatedAt: string;
  rounds: SelfUpgradeRoundResult[];
}

type DeployFn = (args: {
  githubToken?: string;
  repoOwner?: string;
  repoName?: string;
  branch?: string;
  forceRebuild?: boolean;
}) => Promise<Record<string, unknown>>;

function safeSessionId(): string {
  return `upgrade_${new Date().toISOString().replace(/[:.]/g, "-")}_${crypto.randomBytes(4).toString("hex")}`;
}

function assertSafeRelativePath(filePath: string): string {
  const clean = String(filePath || "").trim().replace(/^[/\\]+/, "");
  if (!clean || path.isAbsolute(clean)) throw new Error("Candidate file path is required.");
  const normalized = path.posix.normalize(clean.replace(/\\/g, "/"));
  if (normalized === ".." || normalized.startsWith("../") || normalized.includes("/../")) {
    throw new Error("Candidate file path may not escape the upgrade workspace.");
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
    throw new Error("Upgrade candidate may not modify deployment, dependency, or secret configuration.");
  }
  if (!(normalized === "server.ts" || normalized.startsWith("src/"))) {
    throw new Error("Upgrade candidate must target server.ts or a file under src/.");
  }
  return normalized;
}

function copyWorkspace(sourceRoot: string, targetRoot: string): void {
  fs.mkdirSync(targetRoot, { recursive: true });
  const skip = new Set([".git", "node_modules", "dist", "upgrade-workspaces"]);
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
  if (fs.existsSync(sourceNodeModules) && !fs.existsSync(targetNodeModules)) {
    fs.symlinkSync(sourceNodeModules, targetNodeModules, os.platform() === "win32" ? "junction" : "dir");
  }
}

function persistSession(session: SelfUpgradeSession): void {
  const dir = path.join(session.workspaceRoot, "sessions");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${session.sessionId}.json`), JSON.stringify(session, null, 2), "utf8");
}

async function runCheck(workspace: string, command: string): Promise<{ ok: boolean; output: string }> {
  try {
    const result = await execAsync(command, {
      cwd: workspace,
      timeout: 120000,
      maxBuffer: 8 * 1024 * 1024,
    });
    return { ok: true, output: `${result.stdout || ""}${result.stderr || ""}`.slice(-12000) };
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string; message?: string };
    return { ok: false, output: `${e.stdout || ""}${e.stderr || ""}${e.message || ""}`.slice(-12000) };
  }
}

async function restoreFiles(activeRoot: string, backups: Map<string, string | null>): Promise<void> {
  for (const [rel, previous] of backups) {
    const target = path.join(activeRoot, rel);
    if (previous === null) {
      try { fs.rmSync(target, { force: true }); } catch {}
    } else {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, previous, "utf8");
    }
  }
}

function summarizeFailure(lint: { ok: boolean; output: string }, build: { ok: boolean; output: string }): string {
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
  if (!Number.isInteger(requestedRounds) || requestedRounds < 1 || requestedRounds > 50) {
    throw new Error("requestedRounds must be an integer from 1 to 50.");
  }

  const explicitCandidates = Array.isArray(request.candidates) ? request.candidates : [];
  if (explicitCandidates.length > 0 && explicitCandidates.length < requestedRounds) {
    throw new Error("When explicit candidates are supplied, provide one candidate for every requested round.");
  }
  if (explicitCandidates.length === 0 && typeof deps.generateCandidate !== "function") {
    throw new Error("No candidates supplied and no autonomous candidate generator is configured.");
  }

  const activeRoot = path.resolve(deps.activeWorkspace);
  const workspaceRoot = path.resolve(
    request.workspaceRoot || path.join(activeRoot, "upgrade-workspaces")
  );
  fs.mkdirSync(workspaceRoot, { recursive: true });

  const session: SelfUpgradeSession = {
    sessionId: safeSessionId(),
    instruction: String(request.instruction || "").slice(0, 1000),
    requestedRounds,
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
          activeWorkspace: activeRoot,
          previousFailure,
          previousCandidate,
        });
        generated = true;
      }

      const rel = assertSafeRelativePath(candidate.filePath);
      if (!candidate.fileContent || candidate.fileContent.length > 1024 * 1024) {
        throw new Error("Candidate file content must be non-empty and <= 1 MiB.");
      }

      const candidateWorkspace = path.join(workspaceRoot, session.sessionId, `round-${round}`);
      fs.mkdirSync(candidateWorkspace, { recursive: true });
      copyWorkspace(activeRoot, candidateWorkspace);

      const candidateFile = path.join(candidateWorkspace, rel);
      fs.mkdirSync(path.dirname(candidateFile), { recursive: true });
      fs.writeFileSync(candidateFile, String(candidate.fileContent), "utf8");

      const lint = await runCheck(candidateWorkspace, "npm run lint");
      if (!lint.ok) {
        const error = summarizeFailure(lint, { ok: true, output: "" });
        session.rounds.push({
          round, candidatePath: rel, candidateWorkspace,
          checks: { lint: false, build: false },
          generated, deployed: false, error,
        });
        previousFailure = error;
        previousCandidate = candidate;
        session.updatedAt = new Date().toISOString();
        persistSession(session);
        continue;
      }

      const build = await runCheck(candidateWorkspace, "npm run build");
      if (!build.ok) {
        const error = summarizeFailure(lint, build);
        session.rounds.push({
          round, candidatePath: rel, candidateWorkspace,
          checks: { lint: true, build: false },
          generated, deployed: false, error,
        });
        previousFailure = error;
        previousCandidate = candidate;
        session.updatedAt = new Date().toISOString();
        persistSession(session);
        continue;
      }

      if (!request.deploy) {
        session.rounds.push({
          round, candidatePath: rel, candidateWorkspace,
          checks: { lint: true, build: true },
          generated, deployed: false,
        });
        session.completedRounds = round;
        session.updatedAt = new Date().toISOString();
        persistSession(session);
        continue;
      }

      const target = path.join(activeRoot, rel);
      const backups = new Map<string, string | null>();
      backups.set(rel, fs.existsSync(target) ? fs.readFileSync(target, "utf8") : null);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(candidateFile, target);

      const deployment = await deps.deploy({
        githubToken: deps.githubToken,
        repoOwner: "malazhub",
        repoName: "key",
        branch: "main",
        forceRebuild: true,
      });

      if (deployment.success !== true || deployment.verified !== true) {
        await restoreFiles(activeRoot, backups);
        const error = "Deployment did not return verified=true; active workspace restored.";
        session.rounds.push({
          round, candidatePath: rel, candidateWorkspace,
          checks: { lint: true, build: true },
          generated, deployed: false, deployment, error,
        });
        previousFailure = error;
        previousCandidate = candidate;
        session.updatedAt = new Date().toISOString();
        persistSession(session);
        continue;
      }

      session.rounds.push({
        round, candidatePath: rel, candidateWorkspace,
        checks: { lint: true, build: true },
        generated, deployed: true, deployment,
      });
      session.completedRounds = round;
      session.updatedAt = new Date().toISOString();
      session.status = "COMPLETED";
      persistSession(session);
      return session;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      session.rounds.push({
        round,
        candidatePath: String(candidate?.filePath || "generation-error"),
        candidateWorkspace: path.join(workspaceRoot, session.sessionId, `round-${round}`),
        checks: { lint: false, build: false },
        generated,
        deployed: false,
        error: message,
      });
      previousFailure = message;
      previousCandidate = candidate;
      session.updatedAt = new Date().toISOString();
      persistSession(session);
    }
  }

  session.status = "EXHAUSTED";
  session.updatedAt = new Date().toISOString();
  persistSession(session);
  return session;
}
