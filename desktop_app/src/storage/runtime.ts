import { isTauri } from "@tauri-apps/api/core";

/**
 * Where the app is running: in the Tauri desktop window, with real files on disk,
 * or in a plain browser (`npm run dev:browser`), with the browser storage adapter.
 */
export type Runtime = "desktop" | "browser";

export function detectRuntime(): Runtime {
  return isTauri() ? "desktop" : "browser";
}
