import fs from "node:fs";
import path from "node:path";

/**
 * Evaluate one of the app's classic-script modules in the jsdom global scope,
 * exactly as a <script> tag would. The module publishes itself on window.*.
 */
export function loadScript(relPath) {
  const src = fs.readFileSync(path.resolve(process.cwd(), relPath), "utf8");
  (0, eval)(src); // indirect eval → global scope
}

export const APP_SCRIPTS = [
  "frontend/js/notify.js",
  "frontend/js/context_panel.js",
  "frontend/js/dump_panel.js",
  "frontend/js/llm_panel.js",
  "frontend/js/chapter_panel.js",
  "frontend/js/snapshot.js",
  "frontend/js/chapter_c_panel.js",
  "frontend/js/architecture_panel.js",
  "frontend/js/research_panel.js",
  "frontend/js/style_panel.js",
  "frontend/js/voices_panel.js",
  "frontend/js/export_panel.js",
  "frontend/js/app.js",
];
