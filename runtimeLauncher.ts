import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const repositoryRoot = path.dirname(fileURLToPath(import.meta.url));

function resolveActiveRuntime(): string {
  const configuredRoot = String(
    process.env.KEY_PERSISTENT_DATA_ROOT || ""
  ).trim();

  const workspaceRoot = path.resolve(
    configuredRoot ||
      path.join(repositoryRoot, "upgrade-workspaces")
  );

  const statePath = path.join(
    workspaceRoot,
    "active-runtime.json"
  );

  if (!fs.existsSync(statePath)) {
    return repositoryRoot;
  }

  try {
    const state = JSON.parse(
      fs.readFileSync(statePath, "utf8")
    );

    const runtimeWorkspace = String(
      state?.runtimeWorkspace || ""
    ).trim();

    if (!runtimeWorkspace) {
      throw new Error(
        "Active upgraded runtime marker exists but contains no runtime workspace."
      );
    }

    const resolved = path.resolve(runtimeWorkspace);

    if (!fs.existsSync(path.join(resolved, "server.ts"))) {
      throw new Error(
        `Active upgraded runtime workspace is missing server.ts: ${resolved}`
      );
    }

    return resolved;
  } catch (error) {
    throw new Error(
      `Active upgraded runtime could not be restored; refusing to fall back to the original GitHub runtime. ${String(
        error instanceof Error ? error.message : error
      )}`
    );
  }
}

const runtimeWorkspace = resolveActiveRuntime();

if (runtimeWorkspace === path.resolve(repositoryRoot)) {
  await import("./server.ts");
} else {
  const child = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      path.join(runtimeWorkspace, "server.ts"),
    ],
    {
      cwd: runtimeWorkspace,
      env: {
        ...process.env,
        KEY_ACTIVE_RUNTIME: runtimeWorkspace,
      },
      stdio: "inherit",
    }
  );

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });
}
