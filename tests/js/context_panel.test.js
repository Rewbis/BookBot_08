import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadScript } from "./load.js";

const CP = () => window.ContextPanel;

beforeAll(() => {
  loadScript("frontend/js/context_panel.js");
});

beforeEach(() => {
  window.ChapterPanel = { chapters: [] };
  window.LLMPanel = { premiseSummary: "" };
});

describe("estimateTokens", () => {
  it("is ~1.3 tokens per word and 0 for empty", () => {
    expect(CP().estimateTokens("")).toBe(0);
    expect(CP().estimateTokens(null)).toBe(0);
    expect(CP().estimateTokens("one two three four five six seven eight nine ten")).toBe(13);
  });
});

describe("compressedAlternative", () => {
  it("swaps a chapter skeleton for the chapter summary via source_ref", () => {
    window.ChapterPanel.chapters = [{ id: "ch-1", number: 1, summary: "short", enrich_draft_summary: "medium" }];
    const el = { element_type: "chapter_skeleton", label: "Ch 1 Skeleton: Arrival", source_ref: "ch-1" };
    expect(CP().compressedAlternative(el)).toBe("short");
  });

  it("falls back to enrich summary, then to the label for older snapshots", () => {
    window.ChapterPanel.chapters = [{ id: "ch-2", number: 2, summary: "", enrich_draft_summary: "medium" }];
    expect(CP().compressedAlternative({ element_type: "chapter_skeleton", label: "Ch 2 Skeleton: X", source_ref: "" })).toBe("medium");
    expect(CP().compressedAlternative({ element_type: "chapter_skeleton", label: "Ch 9 Skeleton: X", source_ref: "" })).toBeNull();
  });

  it("returns null when no summary exists yet", () => {
    window.ChapterPanel.chapters = [{ id: "ch-1", number: 1, summary: "   ", enrich_draft_summary: "" }];
    expect(CP().compressedAlternative({ element_type: "chapter_skeleton", source_ref: "ch-1" })).toBeNull();
  });

  it("swaps the full premise for the premise summary", () => {
    expect(CP().compressedAlternative({ element_type: "premise" })).toBeNull();
    window.LLMPanel.premiseSummary = "compressed premise";
    expect(CP().compressedAlternative({ element_type: "premise" })).toBe("compressed premise");
  });

  it("has no alternative for other element types", () => {
    expect(CP().compressedAlternative({ element_type: "style_guide" })).toBeNull();
  });
});

describe("setBudget", () => {
  it("accepts a zero input cost for the local model", () => {
    CP().updateTokenTotal = () => {};
    CP().setBudget({ context_warn_tokens: 12288, context_window: 16384, input_cost_per_mtok: 0 });
    expect(CP().budget).toEqual({ warnTokens: 12288, contextWindow: 16384, inputCostPerMtok: 0 });
    CP().setBudget({ input_cost_per_mtok: 2 });
    expect(CP().budget.inputCostPerMtok).toBe(2);
    expect(CP().budget.warnTokens).toBe(12288);     // untouched when absent
  });
});

describe("exportElementsForLLM", () => {
  it("sends enabled elements in order with label + content only", () => {
    CP().contextElements = [
      { id: "b", label: "B", content: "2", enabled: true, order: 1, token_count: 1 },
      { id: "a", label: "A", content: "1", enabled: true, order: 0, token_count: 1 },
      { id: "x", label: "X", content: "9", enabled: false, order: 2, token_count: 1 },
    ];
    expect(CP().exportElementsForLLM()).toEqual([{ label: "A", content: "1" }, { label: "B", content: "2" }]);
  });
});
