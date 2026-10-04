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
      return repositoryRoot;
    }

    const resolved = path.resolve(runtimeWorkspace);

    if (
      fs.existsSync(path.join(resolved, "server.ts"))
    ) {
      return resolved;
    }
  } catch {
    // Fall back to the repository version if the runtime marker is invalid.
  }

  return repositoryRoot;
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
