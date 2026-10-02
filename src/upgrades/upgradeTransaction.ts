import { createHash } from "node:crypto";

export const KEY_UPGRADE_MODULE_VERSION = "1.0.0";
export type KeyMode = "NORMAL" | "LEARN" | "UPGRADE" | "SLEEP";
export type TrustedStrategy = "PARALLEL_DELEGATION" | "SEQUENTIAL_CHAIN" | "CONSENSUS_VOTE";

export interface EngineDescriptor { readonly name: string; readonly capabilities: readonly string[]; }
export interface StrategyStep { readonly strategy: TrustedStrategy; readonly engines: readonly string[]; readonly instruction: string; }
export interface KeyLogic {
  readonly schemaVersion: 1;
  readonly orchestration: { readonly strategy: TrustedStrategy; readonly steps: readonly StrategyStep[] };
  readonly conflictResolution: { readonly strategy: TrustedStrategy; readonly minimumIndependentEngines: number };
  readonly learning: { readonly enabled: boolean; readonly requiresExplicitCommand: true };
  readonly upgrade: {
    readonly requiresExplicitCommand: true;
    readonly automaticInstallWhenCapabilitiesPreserved: true;
    readonly administratorRequiredWhenCapabilityLost: true;
  };
}
export interface CapabilityTest { readonly id: string; readonly description: string; readonly run: (logic: KeyLogic) => Promise<boolean> | boolean; }
export interface CapabilityTestResult { readonly id: string; readonly passed: boolean; }
export interface UpgradeCandidate { readonly versionLabel: string; readonly logic: KeyLogic; readonly source: "ADMIN" | "EXTERNAL_AI_ENGINES"; readonly rationale?: string; }
export interface UpgradeVersion {
  readonly versionId: string; readonly parentVersionId: string; readonly createdAt: string;
  readonly logicHash: string; readonly logic: KeyLogic;
  readonly capabilityTests: readonly CapabilityTestResult[]; readonly status: "ACTIVE" | "INACTIVE";
}
export interface UpgradeStore {
  readonly saveImmutableVersion: (version: UpgradeVersion) => Promise<void> | void;
  readonly atomicallyActivateVersion: (versionId: string, expectedActiveVersionId: string) => Promise<void> | void;
}
export interface UpgradeAuthority {
  readonly canPermanentlyChangeLogic: (mode: KeyMode) => boolean;
  readonly requiresAdministrator: (capabilityLost: boolean) => boolean;
}
export interface UpgradeDecision {
  readonly status: "REJECTED_MODE" | "REJECTED_INVALID_CANDIDATE" | "PENDING_ADMIN_DECISION" | "AUTO_INSTALLED";
  readonly reason: string; readonly version?: UpgradeVersion;
}

export const TRUSTED_STRATEGIES: readonly TrustedStrategy[] = [
  "PARALLEL_DELEGATION", "SEQUENTIAL_CHAIN", "CONSENSUS_VOTE",
] as const;

export const DEFAULT_UPGRADE_AUTHORITY: UpgradeAuthority = Object.freeze({
  canPermanentlyChangeLogic: (mode: KeyMode) => mode === "UPGRADE",
  requiresAdministrator: (capabilityLost: boolean) => capabilityLost,
});

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => [k, stable(v)])
  );
  return value;
}

export function hashKeyLogic(logic: KeyLogic): string {
  return createHash("sha256").update(JSON.stringify(stable(logic)), "utf8").digest("hex");
}

export function validateKeyLogic(candidate: unknown): candidate is KeyLogic {
  if (!candidate || typeof candidate !== "object") return false;
  const c = candidate as Partial<KeyLogic>;
  if (c.schemaVersion !== 1 || !c.orchestration || !TRUSTED_STRATEGIES.includes(c.orchestration.strategy)) return false;
  if (!Array.isArray(c.orchestration.steps) || c.orchestration.steps.length === 0) return false;
  if (!c.conflictResolution || !TRUSTED_STRATEGIES.includes(c.conflictResolution.strategy) ||
      !Number.isInteger(c.conflictResolution.minimumIndependentEngines) ||
      c.conflictResolution.minimumIndependentEngines < 1) return false;
  if (!c.learning || c.learning.enabled !== true || c.learning.requiresExplicitCommand !== true) return false;
  if (!c.upgrade || c.upgrade.requiresExplicitCommand !== true ||
      c.upgrade.automaticInstallWhenCapabilitiesPreserved !== true ||
      c.upgrade.administratorRequiredWhenCapabilityLost !== true) return false;
  return c.orchestration.steps.every(step =>
    TRUSTED_STRATEGIES.includes(step.strategy) &&
    Array.isArray(step.engines) && step.engines.length > 0 &&
    typeof step.instruction === "string" && step.instruction.trim().length > 0
  );
}

export function containsExecutableCode(value: unknown): boolean {
  if (typeof value === "string") return /(?:^|\n)\s*(?:import|export)\s+|(?:function|class)\s+[A-Za-z_$]|=>|require\s*\(|<script\b/i.test(value);
  if (Array.isArray(value)) return value.some(containsExecutableCode);
  if (value && typeof value === "object") return Object.values(value as Record<string, unknown>).some(containsExecutableCode);
  return false;
}

export function validateUpgradeCandidate(candidate: unknown): candidate is UpgradeCandidate {
  if (!candidate || typeof candidate !== "object") return false;
  const c = candidate as Partial<UpgradeCandidate>;
  return typeof c.versionLabel === "string" && c.versionLabel.trim().length > 0 &&
    (c.source === "ADMIN" || c.source === "EXTERNAL_AI_ENGINES") &&
    validateKeyLogic(c.logic) && !containsExecutableCode(c.logic);
}

export async function collectUpgradeProposals(params: {
  currentLogic: KeyLogic; engines: readonly EngineDescriptor[];
  ask: (engine: EngineDescriptor, prompt: string) => Promise<unknown>;
}) {
  const prompt = "Propose declarative KeyLogic using ONLY PARALLEL_DELEGATION, SEQUENTIAL_CHAIN, or CONSENSUS_VOTE. Never output executable JavaScript/TypeScript. Preserve NORMAL/LEARN/UPGRADE/SLEEP authority boundaries.";
  return Promise.all(params.engines.map(async engine => ({ engine: engine.name, proposal: await params.ask(engine, prompt) })));
}

export async function runCapabilityTests(logic: KeyLogic, tests: readonly CapabilityTest[]): Promise<CapabilityTestResult[]> {
  const out: CapabilityTestResult[] = [];
  for (const test of tests) {
    let passed = false;
    try { passed = Boolean(await test.run(logic)); } catch { passed = false; }
    out.push(Object.freeze({ id: test.id, passed }));
  }
  return out;
}

export function detectCapabilityLoss(oldResults: readonly CapabilityTestResult[], newResults: readonly CapabilityTestResult[]): string[] {
  const next = new Map(newResults.map(r => [r.id, r.passed]));
  return oldResults.filter(r => r.passed && next.get(r.id) !== true).map(r => r.id);
}

export async function executeUpgradeTransaction(params: {
  mode: KeyMode; currentVersion: UpgradeVersion; candidate: UpgradeCandidate;
  capabilityTests: readonly CapabilityTest[]; store: UpgradeStore;
  authority?: UpgradeAuthority; now?: () => string;
}): Promise<UpgradeDecision> {
  const authority = params.authority ?? DEFAULT_UPGRADE_AUTHORITY;
  if (!authority.canPermanentlyChangeLogic(params.mode))
    return { status: "REJECTED_MODE", reason: "Permanent logic changes are permitted only in explicit UPGRADE mode." };
  if (!validateUpgradeCandidate(params.candidate))
    return { status: "REJECTED_INVALID_CANDIDATE", reason: "Candidate must be declarative KeyLogic using only trusted predefined strategies." };

  const newResults = await runCapabilityTests(params.candidate.logic, params.capabilityTests);
  const lost = detectCapabilityLoss(params.currentVersion.capabilityTests, newResults);
  const version: UpgradeVersion = Object.freeze({
    versionId: params.candidate.versionLabel,
    parentVersionId: params.currentVersion.versionId,
    createdAt: (params.now ?? (() => new Date().toISOString()))(),
    logicHash: hashKeyLogic(params.candidate.logic),
    logic: Object.freeze(params.candidate.logic),
    capabilityTests: Object.freeze(newResults),
    status: "INACTIVE",
  });

  await params.store.saveImmutableVersion(version);
  if (lost.length > 0 && authority.requiresAdministrator(true))
    return { status: "PENDING_ADMIN_DECISION", reason: "OLD PASS + NEW FAIL: " + lost.join(", ") + ". Active version unchanged.", version };

  await params.store.atomicallyActivateVersion(version.versionId, params.currentVersion.versionId);
  return { status: "AUTO_INSTALLED", reason: "Candidate preserved previously passing capabilities and was atomically activated.", version: Object.freeze({ ...version, status: "ACTIVE" }) };
}

export const KEY_MAESTRO_PRINCIPLES = Object.freeze([
  "KEY is the maestro/orchestrator; external AI engines are workers.",
  "Permanent core contains logic and orchestration methodology, not a conventional knowledge database.",
  "NORMAL and LEARN never permanently modify KeyLogic.",
  "UPGRADE is explicit and discrete; one command creates at most one candidate version.",
  "Candidates are declarative and use only trusted predefined strategies.",
  "OLD PASS + NEW FAIL requires administrator decision; active version remains unchanged.",
  "Previous versions are immutable for rollback.",
  "There is no artificial lifetime upgrade count or capability ceiling.",
] as const);
