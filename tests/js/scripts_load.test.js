import { describe, expect, it } from "vitest";
import { APP_SCRIPTS, loadScript } from "./load.js";

// The cheapest possible guard: every frontend module parses and evaluates
// without throwing. This is what `node --check` would have caught during the
// mobile debugging session.
describe("frontend scripts load", () => {
  for (const rel of APP_SCRIPTS) {
    it(`${rel} evaluates in a jsdom window`, () => {
      expect(() => loadScript(rel)).not.toThrow();
    });
  }

  it("publishes the expected globals", () => {
    for (const name of ["ContextPanel", "DumpPanel", "LLMPanel", "ChapterPanel", "ChapterCPanel",
                        "ResearchPanel", "StylePanel", "VoicesPanel", "Snapshot"]) {
      expect(window[name], name).toBeTypeOf("object");
    }
    expect(window._gotoTab).toBeTypeOf("function");
    expect(window.formatContinuityReport).toBeTypeOf("function");
  });
});
