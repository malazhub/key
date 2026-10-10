import { run_self_tests } from "../upgrades/version8Harness.ts";
async function main(): Promise<void> {
  const result = await run_self_tests();

  console.log(JSON.stringify(result, null, 2));

  if (!result || result.passed !== true) {
    console.error("Version 8 self-tests failed.");
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(
    "Version 8 self-tests crashed:",
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
});
