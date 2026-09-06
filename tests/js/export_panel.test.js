import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadScript } from "./load.js";

const EP = () => window.ExportPanel;
const ch = (n, extra = {}) => ({ id: `c${n}`, number: n, title: `Title ${n}`, ...extra });

beforeAll(() => {
  loadScript("frontend/js/export_panel.js");
});

beforeEach(() => {
  window.ChapterPanel = { chapters: [] };
});

describe("text helpers", () => {
  it("chapterText prefers the human-edited full_text, then the latest pass", () => {
    expect(EP().chapterText(ch(1, { full_text: "edited", polish_draft: "p" }))).toBe("edited");
    expect(EP().chapterText(ch(1, { polish_draft: "p", enrich_draft: "e" }))).toBe("p");
    expect(EP().chapterText(ch(1, { enrich_draft: "e", draft_text: "d" }))).toBe("e");
    expect(EP().chapterText(ch(1, { draft_text: "  d  " }))).toBe("d");
    expect(EP().chapterText(ch(1))).toBe("");
  });

  it("isApproved accepts either flag", () => {
    expect(EP().isApproved(ch(1, { approved: true }))).toBe(true);
    expect(EP().isApproved(ch(1, { phase_c_status: "approved" }))).toBe(true);
    expect(EP().isApproved(ch(1, { phase_c_status: "polish" }))).toBe(false);
  });

  it("wordCount and openingWords", () => {
    expect(EP().wordCount("")).toBe(0);
    expect(EP().wordCount("  one two\n three ")).toBe(3);
    const long = Array.from({ length: 2000 }, (_, i) => `w${i}`).join(" ");
    expect(EP().openingWords(long).split(" ")).toHaveLength(1200);
    expect(EP().openingWords(long, 5)).toBe("w0 w1 w2 w3 w4");
  });
});

describe("snapshot round trip", () => {
  it("exports and restores publishing metadata without DOM", () => {
    EP().el = null;
    EP().author = "A"; EP().tagline = "T"; EP().blurb = "B"; EP().coverPrompt = "C"; EP().coverEnabled = false;
    expect(EP().exportForSnapshot()).toEqual({ author: "A", tagline: "T", blurb: "B", cover_prompt: "C", cover_illustration_enabled: false });
    EP().restoreFromSnapshot({ author: "X", blurb: "Y" });
    expect(EP().author).toBe("X");
    expect(EP().blurb).toBe("Y");
    expect(EP().tagline).toBe("");
    expect(EP().coverPrompt).toBe("");
    expect(EP().coverEnabled).toBe(true);           // older snapshots without the flag default to on
  });
});

describe("illustration toggles", () => {
  it("default on, and a disabled chapter is skipped by generate-all", () => {
    expect(EP().illustrationOn(ch(1))).toBe(true);
    expect(EP().illustrationOn(ch(1, { illustration_enabled: false }))).toBe(false);
    window.ChapterPanel.chapters = [
      ch(1, { full_text: "t", illustration_enabled: false }),
      ch(2, { full_text: "t" }),
      ch(3, { full_text: "t", illustration_prompt: "done" }),
    ];
    const targets = window.ChapterPanel.chapters.filter(c => EP().illustrationOn(c) && EP().chapterText(c) && !c.illustration_prompt);
    expect(targets.map(c => c.number)).toEqual([2]);
  });
});

describe("render", () => {
  it("counts approved / included / words and disables export when nothing will export", () => {
    document.body.innerHTML = `
      <input id="export-author"><input id="export-tagline"><textarea id="export-blurb"></textarea>
      <div id="export-title-options"></div><textarea id="export-cover-prompt"></textarea><input type="checkbox" id="export-cover-enabled" checked>
      <table><tbody id="export-chapters"></tbody></table><p id="export-summary"></p>
      <input type="checkbox" id="export-include-unapproved"><div id="export-result"></div><span id="export-status"></span>
      <button id="btn-export-blurb"></button><button id="btn-export-cover"></button><button id="btn-export-all-illos"></button>
      <button data-export-format="epub"></button>`;
    EP().init();
    window.ChapterPanel.chapters = [
      ch(2, { full_text: "a b c", approved: true }),
      ch(1, { full_text: "d e", phase_c_status: "polish" }),
      ch(3),
    ];
    EP().render();
    const rows = [...document.querySelectorAll("#export-chapters tr")];
    expect(rows.map(r => r.querySelector(".export-num").textContent)).toEqual(["1", "2", "3"]);
    expect(rows[0].classList.contains("export-skip")).toBe(true);    // not approved
    expect(rows[1].classList.contains("export-skip")).toBe(false);
    expect(rows[2].classList.contains("export-skip")).toBe(true);    // no text
    expect(document.getElementById("export-summary").textContent).toBe("1 / 3 approved · 1 chapter will export · 3 words");
    expect(document.querySelector("[data-export-format]").disabled).toBe(false);

    document.getElementById("export-include-unapproved").checked = true;
    EP().render();
    expect(document.getElementById("export-summary").textContent).toBe("1 / 3 approved · 2 chapters will export · 5 words");

    window.ChapterPanel.chapters = [ch(1)];
    EP().render();
    expect(document.querySelector("[data-export-format]").disabled).toBe(true);
  });

  it("per-chapter toggle hides the prompt UI and cover toggle disables the cover controls", () => {
    window.ChapterPanel.chapters = [ch(1, { full_text: "t", illustration_prompt: "A quay." })];
    EP().render();
    expect(document.querySelector(".illo-prompt")).not.toBeNull();
    EP().setIllustrationEnabled("c1", false);
    expect(document.querySelector(".illo-prompt")).toBeNull();
    expect(document.querySelector(".illo-toggle input").checked).toBe(false);
    expect(window.ChapterPanel.chapters[0].illustration_enabled).toBe(false);

    EP().coverEnabled = false;
    EP().render();
    expect(document.getElementById("btn-export-cover").disabled).toBe(true);
    expect(document.getElementById("export-cover-prompt").disabled).toBe(true);
    expect(document.getElementById("export-cover-enabled").checked).toBe(false);
  });
});
