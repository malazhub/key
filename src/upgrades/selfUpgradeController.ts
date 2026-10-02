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

export type SelfUpgradeSessionStatus =
  | "COMPLETED"
  | "STOPPED"
  | "FAILED"
  | "PENDING_ADMIN_DECISION";

export interface SelfUpgradeControllerRequest {
  instruction: string;
  requestedRounds: number;
  candidates: SelfUpgradeRoundCandidate[];
  deploy: boolean;
  workspaceRoot?: string;
};

export interface SelfUpgradeRoundResult {
  round: number;
  candidatePath: string;
  candidateWorkspace: string;
  checks: {
    lint: boolean;
    build: boolean;
  };
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
  const file = path.join(dir, `${session.sessionId}.json`);
  fs.writeFileSync(file, JSON.stringify(session, null, 2), "utf8");
}

async function runCheck(workspace: string, command: string): Promise<{ ok: boolean; output: string }> {
  try {
    const result = await execAsync(command, { cwd: workspace, timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
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

export async function runBoundedSelfUpgradeSession(
  request: SelfUpgradeControllerRequest,
  deps: {
    activeWorkspace: string;
    deploy: DeployFn;
    githubToken?: string;
  }
): Promise<SelfUpgradeSession> {
  const requestedRounds = Number(request.requestedRounds);
  if (!Number.isInteger(requestedRounds) || requestedRounds < 1 || requestedRounds > 50) {
    throw new Error("requestedRounds must be an integer from 1 to 50.");
  }
  if (!Array.isArray(request.candidates) || request.candidates.length < requestedRounds) {
    throw new Error("Each requested round must have one explicit candidate file. Provide candidates for every round.");
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

  for (let round = 1; round <= requestedRounds; round += 1) {
    const candidate = request.candidates[round - 1];
    const candidateWorkspace = path.join(workspaceRoot, session.sessionId, `round-${round}`);
    fs.mkdirSync(candidateWorkspace, { recursive: true });
    copyWorkspace(activeRoot, candidateWorkspace);

    const rel = assertSafeRelativePath(candidate.filePath);
    const candidateFile = path.join(candidateWorkspace, rel);
    fs.mkdirSync(path.dirname(candidateFile), { recursive: true });
    fs.writeFileSync(candidateFile, String(candidate.fileContent), "utf8");

    const lint = await runCheck(candidateWorkspace, "npm run lint");
    if (!lint.ok) {
      session.rounds.push({
        round, candidatePath: rel, candidateWorkspace,
        checks: { lint: false, build: false }, deployed: false,
        error: `Lint failed: ${lint.output}`,
      });
      session.updatedAt = new Date().toISOString();
      persistSession(session);
      session.status = "STOPPED";
      persistSession(session);
      return session;
    }

    const build = await runCheck(candidateWorkspace, "npm run build");
    if (!build.ok) {
      session.rounds.push({
        round, candidatePath: rel, candidateWorkspace,
        checks: { lint: true, build: false }, deployed: false,
        error: `Build failed: ${build.output}`,
      });
      session.updatedAt = new Date().toISOString();
      persistSession(session);
      session.status = "STOPPED";
      persistSession(session);
      return session;
    }

    if (!request.deploy) {
      session.rounds.push({
        round, candidatePath: rel, candidateWorkspace,
        checks: { lint: true, build: true }, deployed: false,
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
      session.rounds.push({
        round, candidatePath: rel, candidateWorkspace,
        checks: { lint: true, build: true }, deployed: false,
        deployment,
        error: "Deployment did not return verified=true; active workspace restored.",
      });
      session.updatedAt = new Date().toISOString();
      persistSession(session);
      session.status = "FAILED";
      persistSession(session);
      return session;
    }

    session.rounds.push({
      round, candidatePath: rel, candidateWorkspace,
      checks: { lint: true, build: true }, deployed: true, deployment,
    });
    session.completedRounds = round;
    session.updatedAt = new Date().toISOString();
    persistSession(session);
  }

  session.status = "COMPLETED";
  session.updatedAt = new Date().toISOString();
  persistSession(session);
  return session;
}
