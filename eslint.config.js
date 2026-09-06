import js from "@eslint/js";
import globals from "globals";

// The app's modules are classic scripts that publish themselves on window.*
// and call each other through those globals.
const appGlobals = {
  ContextPanel: "readonly",
  DumpPanel: "readonly",
  LLMPanel: "readonly",
  ChapterPanel: "readonly",
  ChapterCPanel: "readonly",
  ArchitecturePanel: "readonly",
  ResearchPanel: "readonly",
  StylePanel: "readonly",
  VoicesPanel: "readonly",
  Snapshot: "readonly",
};

export default [
  js.configs.recommended,
  {
    files: ["frontend/js/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: { ...globals.browser, ...appGlobals },
    },
    rules: {
      "no-unused-vars": ["warn", { args: "none", caughtErrors: "none" }],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    files: ["tests/js/**/*.js", "vitest.config.js", "eslint.config.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node, ...appGlobals },
    },
  },
];
