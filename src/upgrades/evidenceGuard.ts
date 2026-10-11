// src/upgrades/evidenceGuard.ts
import fs from "node:fs/promises";
import path from "node:path";

export type GateProfile = "full_upgrade";

export type Receipt = {
  decision: string;
  metric: string;
  value: string;
  verdict: "pass" | "fail";
  timestamp: string;
};

export type CompletionEvidence = {
  fileWriteVerified?: boolean;
  intendedFileChanged?: boolean;
  lintPassed?: boolean;
  buildPassed?: boolean;
  selfTestPassed?: boolean;
  selfDiagnosisPassed?: boolean;
};

export type GateResult = {
  passed: boolean;
  blocking: string[];
  receipts: Receipt[];
};

export async function verifyFileWrite(
  absoluteFilePath: string,
  expectedContent: string
): Promise<{
  verified: boolean;
  actualLength: number;
  expectedLength: number;
}> {
  try {
    const actual = await fs.readFile(absoluteFilePath, "utf8");
    return {
      verified: actual === expectedContent,
      actualLength: actual.length,
      expectedLength: expectedContent.length,
    };
  } catch {
    return {
      verified: false,
      actualLength: 0,
      expectedLength: expectedContent.length,
    };
  }
}

export async function verifyFileChanged(
  absoluteFilePath: string,
  originalContent: string | null
): Promise<boolean> {
  try {
    const currentContent = await fs.readFile(absoluteFilePath, "utf8");
    return (
      originalContent === null ||
      currentContent !== originalContent
    );
  } catch {
    return false;
  }
}

export function resolveEvidencePath(
  workspaceRoot: string,
  relativePath: string
): string {
  const root = path.resolve(workspaceRoot);
  const target = path.resolve(root, relativePath);
  const relative = path.relative(root, target);

  if (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error("Evidence path escapes the workspace.");
  }

  return target;
}

export function evaluateCompletionClaim(
  evidence: CompletionEvidence,
  profile: GateProfile = "full_upgrade"
): GateResult {
  const blocking: string[] = [];
  const receipts: Receipt[] = [];

  // Every admin upgrade operation must satisfy the full evidence gate:
  // file write, intended change, lint, build, self-test, self-diagnosis.
  const checks: Array<{
    key: keyof CompletionEvidence;
    decision: string;
    metric: string;
    blockingCode: string;
    requiredFor: GateProfile[];
  }> = [
    {
      key: "fileWriteVerified",
      decision: "file_write_verification",
      metric: "verified",
      blockingCode: "file_write_not_verified",
      requiredFor: ["full_upgrade"],
    },
    {
      key: "intendedFileChanged",
      decision: "file_change_verification",
      metric: "changed",
      blockingCode: "intended_file_not_changed",
      requiredFor: ["full_upgrade"],
    },
    {
      key: "lintPassed",
      decision: "lint_verification",
      metric: "passed",
      blockingCode: "lint_not_verified",
      requiredFor: ["full_upgrade"],
    },
    {
      key: "buildPassed",
      decision: "build_verification",
      metric: "passed",
      blockingCode: "build_not_verified",
      requiredFor: ["full_upgrade"],
    },
    {
      key: "selfTestPassed",
      decision: "self_test_verification",
      metric: "passed",
      blockingCode: "self_test_not_verified",
      requiredFor: ["full_upgrade"],
    },
    {
      key: "selfDiagnosisPassed",
      decision: "self_diagnosis_verification",
      metric: "passed",
      blockingCode: "self_diagnosis_not_verified",
      requiredFor: ["full_upgrade"],
    },
  ];

  for (const check of checks) {
    if (!check.requiredFor.includes(profile)) continue;

    const value = evidence[check.key];
    const passed = value === true;

    if (!passed) blocking.push(check.blockingCode);

    receipts.push({
      decision: check.decision,
      metric: check.metric,
      value: String(value),
      verdict: passed ? "pass" : "fail",
      timestamp: new Date().toISOString(),
    });
  }

  return {
    passed: blocking.length === 0,
    blocking,
    receipts,
  };
}
