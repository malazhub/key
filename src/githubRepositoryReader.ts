
/**
 * Universal GitHub Repository Reader
 *
 * Retrieves repository metadata, commit information, the complete
 * Git tree and relevant text/source files.
 *
 * Runs server-side. Never expose GITHUB_TOKEN to browser code.
 */
import { createHash } from "node:crypto";
export type RepositoryReadStatus =
  | "complete"
  | "partial"
  | "truncated"
  | "failed";

export interface GitHubRepositoryMetadata {
  owner: string;
  name: string;
  fullName: string;
  description: string | null;
  private: boolean;
  defaultBranch: string;
  htmlUrl: string;
  requestedRef: string;
  commitSha: string;
}

export interface GitHubTreeEntry {
  path: string;
  type: "blob" | "tree" | "commit";
  sha: string;
  size?: number;
  mode?: string;
}

export interface GitHubSourceFile {
  path: string;
  sha: string;
  size: number;
  content: string;
}

export interface GitHubRepositoryReadResult {
  status: RepositoryReadStatus;
  metadata: GitHubRepositoryMetadata | null;
  tree: GitHubTreeEntry[];
  files: GitHubSourceFile[];
  failedPaths: string[];
  errors: string[];
  treeTruncated: boolean;
  downloadedFiles: number;
  totalTreeEntries: number;
}

export interface GitHubReaderOptions {
  ref?: string;
  maxFileBytes?: number;
  maxTotalBytes?: number;
}

interface GitHubApiError {
  message?: string;
}

const API = "https://api.github.com";

const TEXT_FILE_PATTERN =
  /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|swift|php|rb|vue|svelte|html|css|scss|json|yaml|yml|md|mdx|txt|sql|sh|toml|xml|graphql|prisma|gradle|properties)$/i;

const IGNORED_PATHS = [
  "node_modules/",
  "vendor/",
  "dist/",
  "build/",
  ".git/",
  ".next/",
  "coverage/",
  ".venv/",
  "target/",
];

function createEmptyResult(): GitHubRepositoryReadResult {
  return {
    status: "failed",

    metadata: null,

    tree: [],

    files: [],

    failedPaths: [],

    skippedPaths: [],

    errors: [],

    treeTruncated: false,

    treeComplete: false,

    inspectionComplete: false,

    downloadedFiles: 0,

    eligibleFileCount: 0,

    totalTreeEntries: 0,

    totalBlobEntries: 0,
  };
}

export function parseGitHubRepositoryReference(
  input: string,
): {
  owner: string;
  repo: string;
  ref?: string;
} {
  const value = input.trim();

  let owner = "";
  let repo = "";
  let ref: string | undefined;

  if (/^https?:\/\//i.test(value)) {
    const url = new URL(value);

    if (url.hostname.toLowerCase() !== "github.com") {
      throw new Error("Only github.com repositories are supported.");
    }

    const parts = url.pathname
      .replace(/\.git\/?$/i, "")
      .split("/")
      .filter(Boolean)
      .map(decodeURIComponent);

    if (parts.length < 2) {
      throw new Error("Invalid GitHub repository URL.");
    }

    [owner, repo] = parts;

    if (parts[2] === "tree" && parts[3]) {
      ref = parts[3];
    } else if (parts[2] && parts[2] !== "tree" &&
               parts[2] !== "blob") {
      throw new Error("Unsupported GitHub repository URL.");
    }
  } else {
    const parts = value.split("/").filter(Boolean);

    if (parts.length !== 2) {
      throw new Error("Repository must use owner/repository format.");
    }

    [owner, repo] = parts;
  }

  if (
    !/^[a-zA-Z0-9_.-]+$/.test(owner) ||
    !/^[a-zA-Z0-9_.-]+$/.test(repo)
  ) {
    throw new Error("Invalid GitHub owner or repository name.");
  }

  return { owner, repo, ref };
}

function decodeGitHubBlob(
  encodedContent: string,
  expectedSha: string,
  expectedSize: number,
): string {
  const bytes = Buffer.from(
    encodedContent.replace(/\s/g, ""),
    "base64",
  );

  if (bytes.length !== expectedSize) {
    throw new Error(
      `Blob size mismatch. Expected ${expectedSize} bytes, received ${bytes.length}.`,
    );
  }

  const actualSha = createHash("sha1")
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest("hex");

  if (actualSha !== expectedSha) {
    throw new Error(
      `Blob SHA verification failed. Expected ${expectedSha}, received ${actualSha}.`,
    );
  }

  try {
    return new TextDecoder("utf-8", {
      fatal: true,
    }).decode(bytes);
  } catch {
    throw new Error(
      "File contents are not valid UTF-8 text.",
    );
  }
}

export async function readGitHubRepository(
  input: string,
  options: GitHubReaderOptions = {},
): Promise<GitHubRepositoryReadResult> {
  const result = createEmptyResult();

  const maxFileBytes =
    options.maxFileBytes ?? 512 * 1024;

  const maxTotalBytes =
    options.maxTotalBytes ?? 4 * 1024 * 1024;

  // This token must exist only in the backend environment.
  // Public repositories work without it.
  const token = process.env.GITHUB_TOKEN?.trim();

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  async function githubGet<T>(url: string): Promise<T> {
    const response = await fetch(url, {
      method: "GET",
      headers,
      cache: "no-store",
    });

    if (!response.ok) {
      let message = `GitHub returned HTTP ${response.status}.`;

      try {
        const error =
          await response.json() as GitHubApiError;

        if (error.message) {
          message += ` ${error.message}`;
        }
      } catch {
        // Preserve the HTTP error.
      }

      throw new Error(message);
    }

    return response.json() as Promise<T>;
  }

  try {
    const parsed = parseGitHubRepositoryReference(input);

    const owner = encodeURIComponent(parsed.owner);
    const repo = encodeURIComponent(parsed.repo);

    const base = `${API}/repos/${owner}/${repo}`;

    // 1. Repository metadata.
    const metadata = await githubGet<{
      name: string;
      full_name: string;
      description: string | null;
      private: boolean;
      default_branch: string;
      html_url: string;
      owner: { login: string };
    }>(base);

    const requestedRef =
      options.ref || parsed.ref || metadata.default_branch;

    // 2. Resolve branch, tag or commit to an immutable SHA.
    const commit = await githubGet<{
  sha: string;
  commit: {
    tree: {
      sha: string;
    };
  };
}>(
  `${base}/commits/${encodeURIComponent(requestedRef)}`,
);

const commitSha = commit.sha;

const rootTreeSha = commit.commit?.tree?.sha;

if (!commitSha || !rootTreeSha) {
  throw new Error(
    "GitHub did not return a valid commit SHA and root tree SHA.",
  );
}

    result.metadata = {
      owner: metadata.owner.login,
      name: metadata.name,
      fullName: metadata.full_name,
      description: metadata.description,
      private: metadata.private,
      defaultBranch: metadata.default_branch,
      htmlUrl: metadata.html_url,
      requestedRef,
      commitSha,
    };

    // 3. Retrieve the recursive Git tree.
    const recursiveTree = await githubGet<{
      tree: Array<{
        path: string;
        type: "blob" | "tree" | "commit";
        sha: string;
        size?: number;
      }>;
      truncated: boolean;
    }>(
      `${base}/git/trees/${rootTreeSha}?recursive=1`,
    );

    result.tree = recursiveTree.tree;
    result.treeTruncated = recursiveTree.truncated;

    // 4. Recover truncated trees by walking directories.
    if (recursiveTree.truncated) {
      const recovered: GitHubTreeEntry[] = [];
      const visited = new Set<string>();

      const walk = async (
        treeSha: string,
        prefix = "",
      ): Promise<void> => {
        if (visited.has(treeSha)) return;

        visited.add(treeSha);

        const page = await githubGet<{
          tree: Array<{
            path: string;
            type: "blob" | "tree" | "commit";
            sha: string;
            size?: number;
          }>;
          truncated: boolean;
        }>(
          `${base}/git/trees/${treeSha}`,
        );

        if (page.truncated) {
          throw new Error(
            `Git tree remains truncated at ${prefix || "/"}.`,
          );
        }

        for (const item of page.tree) {
          const path = prefix
            ? `${prefix}/${item.path}`
            : item.path;

          recovered.push({
            path,
            type: item.type,
            sha: item.sha,
            ...(item.size === undefined
              ? {}
              : { size: item.size }),
          });

          if (item.type === "tree") {
            await walk(item.sha, path);
          }
        }
      };

      try {
        await walk(rootTreeSha);

        result.tree = recovered;
        result.treeTruncated = false;
      } catch (error) {
        result.errors.push(
          `Tree recovery failed: ${
            error instanceof Error
              ? error.message
              : String(error)
          }`,
        );
      }
    }

    result.totalTreeEntries = result.tree.length;
result.treeComplete = !result.treeTruncated;

result.totalBlobEntries = result.tree.filter(
  (entry) => entry.type === "blob",
).length;
    // 5. Identify source files and documentation.
    const sourceFiles: GitHubTreeEntry[] = [];

for (const entry of result.tree) {
  // Submodules are not ordinary source files.
  // Their contents must not be represented as retrieved.
  if (entry.type === "commit") {
    result.skippedPaths.push({
      path: entry.path,
      reason:
        "Git submodule reference detected. Submodule repository contents were not retrieved.",
    });

    continue;
  }

  if (entry.type !== "blob") {
    continue;
  }

  const pathSegments = entry.path.split("/");

  const ignoredDirectory = IGNORED_PATHS.some(
    (prefix) => {
      const ignoredName = prefix.replace(/\/$/, "");

      return pathSegments.includes(ignoredName);
    },
  );

  if (ignoredDirectory) {
    result.skippedPaths.push({
      path: entry.path,
      reason:
        "File is inside an explicitly excluded generated, dependency, build, or vendor directory.",
    });

    continue;
  }

  if (!TEXT_FILE_PATTERN.test(entry.path)) {
    result.skippedPaths.push({
      path: entry.path,
      reason:
        "File extension is not supported by the text/source retrieval filter. File contents were not inspected.",
    });

    continue;
  }

  sourceFiles.push(entry);
}

result.eligibleFileCount = sourceFiles.length;

    // 6. Retrieve blobs in controlled batches.
    let totalBytes = 0;
    const concurrency = 4;

    for (
      let index = 0;
      index < sourceFiles.length;
      index += concurrency
    ) {
      const batch = sourceFiles.slice(
        index,
        index + concurrency,
      );

      const downloaded = await Promise.all(
        batch.map(async (entry) => {
          try {
            const blob = await githubGet<{
  sha: string;
  size: number;
  encoding: string;
  content: string;
}>(
  `${base}/git/blobs/${entry.sha}`,
);

if (!blob.sha || blob.sha !== entry.sha) {
  throw new Error(
    "GitHub returned a blob SHA that does not match the requested tree entry.",
  );
}

if (blob.size > maxFileBytes) {
  throw new Error(
    `File exceeds the configured ${maxFileBytes}-byte per-file limit. Actual size: ${blob.size} bytes.`,
  );
}

if (
  entry.size !== undefined &&
  blob.size !== entry.size
) {
  throw new Error(
    `Tree/blob size mismatch. Tree reports ${entry.size} bytes; blob reports ${blob.size} bytes.`,
  );
}

if (blob.encoding !== "base64") {
  throw new Error(
    `Unsupported GitHub blob encoding: ${blob.encoding}.`,
  );
}

const content = decodeGitHubBlob(
  blob.content,
  entry.sha,
  blob.size,
);

return {
  path: entry.path,
  sha: blob.sha,
  size: blob.size,
  content,
} satisfies GitHubSourceFile;

          } catch (error) {
            result.failedPaths.push(entry.path);

            result.errors.push(
              `${entry.path}: ${
                error instanceof Error
                  ? error.message
                  : String(error)
              }`,
            );

            return null;
          }
        }),
      );

      for (const file of downloaded) {
        if (!file) continue;

        if (totalBytes + file.size > maxTotalBytes) {
          result.failedPaths.push(file.path);

          result.errors.push(
            `${file.path}: repository download size limit reached.`,
          );

          continue;
        }

        totalBytes += file.size;
        result.files.push(file);
      }
    }

    result.downloadedFiles = result.files.length;

result.treeComplete = !result.treeTruncated;

const allBlobEntries = result.tree.filter(
  (entry) => entry.type === "blob",
);

result.totalBlobEntries = allBlobEntries.length;

const downloadedPaths = new Set(
  result.files.map((file) => file.path),
);

const failedPathSet = new Set(
  result.failedPaths,
);

const skippedPathSet = new Set(
  result.skippedPaths.map((item) => item.path),
);

// Every blob must be accounted for.
// A blob must either have been downloaded,
// failed retrieval, or been explicitly skipped.
const unaccountedPaths = allBlobEntries
  .filter(
    (entry) =>
      !downloadedPaths.has(entry.path) &&
      !failedPathSet.has(entry.path) &&
      !skippedPathSet.has(entry.path),
  )
  .map((entry) => entry.path);

for (const path of unaccountedPaths) {
  result.failedPaths.push(path);

  result.errors.push(
    `${path}: file was present in the Git tree but was not accounted for by the retrieval process.`,
  );
}

// Strict definition:
// No missing, failed, skipped, or unverified files.
result.inspectionComplete =
  result.treeComplete &&
  result.failedPaths.length === 0 &&
  result.skippedPaths.length === 0 &&
  result.files.length === result.totalBlobEntries;

// Determine the actual retrieval status.
if (!result.treeComplete) {
  result.status = "truncated";
} else if (!result.inspectionComplete) {
  result.status = "partial";
} else {
  result.status = "complete";
}

    return result;

  } catch (error) {
    result.errors.push(
      error instanceof Error
        ? error.message
        : String(error),
    );

    result.status = result.metadata
      ? "partial"
      : "failed";

    return result;
  }
}
