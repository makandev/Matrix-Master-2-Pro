import { defineConfig } from "vite";

// Base "./" keeps asset paths relative so the same build works both in a
// browser and packaged inside Tauri (loaded from the local filesystem).
export default defineConfig({
  base: "./",
  server: {
    host: "127.0.0.1",
    port: 5199,
    strictPort: true,
  },
  build: {
    target: "esnext",
    outDir: "dist",
    emptyOutDir: true,
  },
});
