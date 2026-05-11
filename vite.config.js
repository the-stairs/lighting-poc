import { defineConfig } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.join(rootDir, "src/renderer"),
  base: "./",
  publicDir: "public",
  envDir: rootDir,
  build: {
    outDir: path.join(rootDir, "dist"),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
  },
});
