import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "src-tauri"] },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },
  {
    // The domain core is pure TypeScript: no UI, no I/O, no platform APIs.
    files: ["src/core/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["**/ui/**", "**/storage/**"], message: "The domain core must not depend on UI or storage." },
            { group: ["react", "react-dom", "react/*", "@tauri-apps/*"], message: "The domain core must stay free of UI and platform APIs." },
          ],
        },
      ],
    },
  },
  {
    // Storage adapters do I/O for the core; they know nothing about the UI.
    files: ["src/storage/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["**/ui/**"], message: "Storage must not depend on the UI." },
            { group: ["react", "react-dom", "react/*"], message: "Storage must not depend on the UI." },
          ],
        },
      ],
    },
  },
);
