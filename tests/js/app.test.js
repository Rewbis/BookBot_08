import { beforeAll, describe, expect, it } from "vitest";
import { loadScript } from "./load.js";

beforeAll(() => {
  loadScript("frontend/js/llm_panel.js");   // defines window.formatContinuityReport
  loadScript("frontend/js/app.js");         // defines window._gotoTab / _isMobile at top level
});

describe("formatContinuityReport", () => {
  it("renders verdict, summary, numbered issues and clue updates", () => {
    const out = window.formatContinuityReport({
      verdict: "revise",
      summary: "Two problems.",
      issues: ["Keel knows the seal is forged before anyone tells him.", "The key reappears."],
      clue_updates: [{ id: "clue_1", status: "blocked", notes: "payoff impossible now" }],
    });
    expect(out).toContain("VERDICT: ⚠️ REVISE");
    expect(out).toContain("1. Keel knows");
    expect(out).toContain("2. The key");
    expect(out).toContain("[BLOCKED] clue_1: payoff impossible now");
  });

  it("copes with missing fields", () => {
    expect(window.formatContinuityReport(null)).toBe("");
    expect(window.formatContinuityReport({})).toContain("NO VERDICT");
    expect(window.formatContinuityReport({ verdict: "approve" })).toContain("✅ APPROVE");
  });
});

describe("layout mode", () => {
  it("is defined at parse time, before DOMContentLoaded", () => {
    expect(window._isMobile).toBeTypeOf("function");
    expect(window._gotoTab).toBeTypeOf("function");
    expect(window._applyLayoutMode).toBeTypeOf("function");
  });
});
