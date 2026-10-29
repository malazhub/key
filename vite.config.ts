
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

dotenv.config();

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(() => ({
  // GitHub Pages project-site deployment.
  base: "/key/",

  plugins: [react(), tailwindcss()],

  resolve: {
    alias: {
      "@": rootDir,
    },
  },

  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,

    // Keep the existing AI Studio editing behavior.
    hmr: process.env.DISABLE_HMR !== "true",
    watch:
      process.env.DISABLE_HMR === "true"
        ? null
        : {},
  },

  preview: {
    host: "0.0.0.0",
    port: 4173,
    strictPort: true,
  },

  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
}));
