
/**
 * Universal GitHub Repository Reader
 *
 * Retrieves repository metadata, commit information, the complete
 * Git tree and relevant text/source files.
 *
 * Runs server-side. Never expose GITHUB_TOKEN to browser code.
 */

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
    errors: [],
    treeTruncated: false,
    downloadedFiles: 0,
    totalTreeEntries: 0,
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

function decodeGitHubBlob(content: string): string {
  return Buffer.from(
    content.replace(/\s/g, ""),
    "base64",
  ).toString("utf8");
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
    }>(
      `${base}/commits/${encodeURIComponent(requestedRef)}`,
    );

    const commitSha = commit.sha;

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
      `${base}/git/trees/${commitSha}?recursive=1`,
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
        await walk(commitSha);

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

    // 5. Identify source files and documentation.
    const sourceFiles = result.tree.filter((entry) => {
      if (entry.type !== "blob") return false;

      if (!TEXT_FILE_PATTERN.test(entry.path)) {
        return false;
      }

      return !IGNORED_PATHS.some((prefix) =>
        entry.path.startsWith(prefix),
      );
    });

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

            if (blob.size > maxFileBytes) {
              throw new Error("File exceeds size limit.");
            }

            if (blob.encoding !== "base64") {
              throw new Error("Unsupported blob encoding.");
            }

            return {
              path: entry.path,
              sha: blob.sha,
              size: blob.size,
              content: decodeGitHubBlob(blob.content),
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

    // 7. Never report an incomplete tree as complete.
    if (result.treeTruncated) {
      result.status = "truncated";
    } else if (result.failedPaths.length > 0) {
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
