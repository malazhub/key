import path from "path";
import fs from "fs";

export type WorkspaceRootInfo = {
  root: string;
  persistent: boolean;
  source: "env" | "runtime";
};

export function resolveKeyWorkspaceRoot(activeWorkspace: string): WorkspaceRootInfo {
  const configured = String(process.env.KEY_WORKSPACE_ROOT || "").trim();

  if (configured) {
    const root = path.resolve(configured);
    fs.mkdirSync(root, { recursive: true });
    return { root, persistent: true, source: "env" };
  }

  const persistentRoot = path.resolve(
    process.env.KEY_PERSISTENT_DATA_ROOT ||
      path.join(activeWorkspace, "upgrade-workspaces")
  );

  fs.mkdirSync(persistentRoot, { recursive: true });

  return {
    root: persistentRoot,
    persistent: true,
    source: process.env.KEY_PERSISTENT_DATA_ROOT ? "env" : "runtime",
  };
}

export function resolveAuditRoot(activeWorkspace: string): string {
  return path.resolve(activeWorkspace);
}

export function safeAuditPath(root: string, requestedPath: string): string {
  const raw = String(requestedPath || "").trim().replace(/^[/\\]+/, "");
  if (!raw) throw new Error("path is required");

  const normalized = path.posix.normalize(raw.replace(/\\/g, "/"));
  if (
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.includes("/../") ||
    normalized.startsWith(".git") ||
    normalized.startsWith("node_modules/") ||
    normalized.startsWith("dist/") ||
    normalized.startsWith("upgrade-workspaces/")
  ) {
    throw new Error("path is not allowed");
  }

  const absolute = path.resolve(root, normalized);
  const relative = path.relative(root, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("path escapes workspace");
  }
  return absolute;
}

export function isAuditReadablePath(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/");
  if (normalized.startsWith(".github/")) return false;
  if (
    normalized === ".env" ||
    normalized.startsWith(".env.") ||
    normalized.endsWith(".pem") ||
    normalized.endsWith(".key") ||
    normalized.includes("credentials")
  ) return false;
  return normalized === "server.ts" || normalized.startsWith("src/");
}
