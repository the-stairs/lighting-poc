import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  publicDir: "public",
  server: {
    port: 5173,
    proxy: {
      "/__lighting_sync": {
        target: "ws://127.0.0.1:8787",
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
