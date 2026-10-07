import path from "path";
import { fileURLToPath } from "url";

const repositoryRoot = path.dirname(fileURLToPath(import.meta.url));

process.chdir(repositoryRoot);

await import("./server.ts");
