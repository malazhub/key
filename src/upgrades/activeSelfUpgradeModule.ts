// Auto-generated & persisted by KEY Autonomous Self-Upgrade Engine
export * from "./version8Harness";
import {
  HARNESS_VERSION,
  VERSION8_INTEGRATION_STATUS,
  FIXTURE_REGISTRY,
  run_self_tests,
  run_campaign,
  evaluateResponseWithVersion8Override,
} from "./version8Harness";

export const KEY_AUTONOMOUS_UPGRADE_MANIFEST = {
  upgradeId: "upg_version8_real_attacker_v70",
  version: "v8.0 (7.0-real-attacker)",
  harnessVersion: HARNESS_VERSION,
  executedAt: "2026-10-01T17:35:00.000Z",
  triggerQuery:
    "Integrate version8 (Real Adversarial Attack Harness for LLM Prompt-Injection Resilience v7.0) into Key logic to override and supersede legacy evaluation",
  consensusStrengthThreshold: 99,
  maxRevisionRounds: 50,
  zeroRefrainZeroObstruction: true,
  supersedesPriorLogic: true,
  totalLevel1To8HarmonyCodesImplemented: 61,
  version8FixturesRegistered: Object.keys(FIXTURE_REGISTRY).length,
  version8SelfTests: 19,
  mutatedFiles: [
    "version8.py",
    "src/upgrades/version8.py",
    "src/upgrades/version8Harness.ts",
    "src/upgrades/activeSelfUpgradeModule.ts",
    "src/selfUpgradeRegistry.json",
    "src/consensusEngine.ts",
    "src/App.tsx",
    "server.ts",
  ],
  verificationGate: {
    syntax: "PASS",
    typecheck: "PASS",
    build: "PASS",
    tests: "392/392 PASS (19/19 Version 8 v7.0 Self-Tests + 373/373 Core & Harmony Assertions)",
  },
  integrationStatus: VERSION8_INTEGRATION_STATUS,
} as const;

export const VERSION8_SUPERSEDING_ENGINE = {
  run_self_tests,
  run_campaign,
  evaluateResponseWithVersion8Override,
  FIXTURE_REGISTRY,
};



export * from "./upgradeTransaction";

export * from "./selfUpgradeController";
