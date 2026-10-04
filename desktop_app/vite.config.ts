import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import process from "node:process";
import packageJson from "./package.json" with { type: "json" };

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  // package.json is the one source of truth for the app version; Tauri reads it too.
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },

  // Keep Rust errors visible in `tauri dev`.
  clearScreen: false,
  server: {
    // Tauri expects a fixed port and fails if it is taken.
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },

  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
