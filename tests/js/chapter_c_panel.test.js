import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadScript } from "./load.js";

const ch = (n, extra = {}) => ({ id: `c${n}`, number: n, title: `Chapter ${n}`, ...extra });
const CC = () => window.ChapterCPanel;

beforeAll(() => {
  loadScript("frontend/js/chapter_c_panel.js");
});

beforeEach(() => {
  window.ChapterPanel = { chapters: [] };
  window.DumpPanel = { plantedClues: [] };
  window.VoicesPanel = { profiles: [] };
});

describe("clueRefersToChapter", () => {
  it("matches a chapter number written several ways", () => {
    const c = ch(3);
    for (const ref of ["3", "Ch 3", "Chapter 3", "ch.3", "CHAPTER 3 (the docks)", "chapters 2-3"]) {
      expect(CC().clueRefersToChapter(ref, c), ref).toBe(true);
    }
  });

  it("does not match other numbers, substrings, or empty refs", () => {
    const c = ch(3);
    expect(CC().clueRefersToChapter("Chapter 13", c)).toBe(false);
    expect(CC().clueRefersToChapter("Chapter 30", c)).toBe(false);
    expect(CC().clueRefersToChapter("", c)).toBe(false);
    expect(CC().clueRefersToChapter(null, c)).toBe(false);
  });

  it("matches a distinctive title but never the 'Chapter N' placeholder", () => {
    expect(CC().clueRefersToChapter("during Landfall", ch(3, { title: "Landfall" }))).toBe(true);
    expect(CC().clueRefersToChapter("chapter 4", ch(3, { title: "Chapter 3" }))).toBe(false);
  });
});

describe("cluesDueFor", () => {
  it("tags plants and payoffs and skips blocked clues", () => {
    window.DumpPanel.plantedClues = [
      { id: "a", label: "Brass key", description: "d1", planted_in: "Ch 2", pays_off_in: "Chapter 5", status: "active" },
      { id: "b", label: "Forged seal", description: "d2", planted_in: "2", pays_off_in: "2", status: "active" },
      { id: "c", label: "Blocked", description: "d3", planted_in: "2", pays_off_in: "", status: "blocked" },
    ];
    const due2 = CC().cluesDueFor(ch(2));
    expect(due2).toEqual([
      { label: "Brass key", description: "d1", role: "plant" },
      { label: "Forged seal", description: "d2", role: "plant" },
      { label: "Forged seal", description: "d2", role: "payoff" },
    ]);
    expect(CC().cluesDueFor(ch(5))).toEqual([{ label: "Brass key", description: "d1", role: "payoff" }]);
    expect(CC().cluesDueFor(ch(9))).toEqual([]);
  });
});

describe("progress pills", () => {
  it("marks completed passes and only the running pass of the generating chapter", () => {
    const c1 = ch(1, { draft_text: "d", enrich_draft: "e" });
    const c2 = ch(2, { draft_text: "d" });
    CC().generatingId = c1.id;
    CC().currentPass = "critic";
    const s1 = Object.fromEntries(CC().getPassStatus(c1).map(p => [p.name, p]));
    expect(s1.draft).toMatchObject({ done: true, active: false });
    expect(s1.enrich).toMatchObject({ done: true, active: false });
    expect(s1.critic).toMatchObject({ done: false, active: true });
    expect(s1.polish).toMatchObject({ done: false, active: false });
    expect(s1.continuity).toMatchObject({ done: false, active: false });
    // another chapter is never "active", even at the same pass name
    expect(CC().getPassStatus(c2).every(p => !p.active)).toBe(true);
    CC().clearPass();
    expect(CC().getPassStatus(c1).every(p => !p.active)).toBe(true);
  });

  it("continuity pill is done only when checked and not stale", () => {
    expect(CC().getPassStatus(ch(1, { continuity_verdict: "approve" })).at(-1).done).toBe(true);
    expect(CC().getPassStatus(ch(1, { continuity_verdict: "approve", state_stale: true })).at(-1).done).toBe(false);
  });

  it("setPass records the chapter and pass and updates the status line", () => {
    const statuses = [];
    CC().updateStatus = m => statuses.push(m);
    CC().renderAllChapters = () => {};
    const c = ch(4);
    CC().setPass(c, "enrich", "Enriching draft...");
    expect(CC().generatingId).toBe(c.id);
    expect(CC().currentPass).toBe("enrich");
    expect(statuses).toEqual(["Enriching draft..."]);
    CC().clearPass();
    expect(CC().generatingId).toBeNull();
  });
});

describe("story state helpers", () => {
  it("hasState is false for missing or empty state", () => {
    expect(CC().hasState(ch(1))).toBe(false);
    expect(CC().hasState(ch(1, { story_state: {} }))).toBe(false);
    expect(CC().hasState(ch(1, { story_state: { chapter: 1 } }))).toBe(true);
  });

  it("priorStateFor uses the nearest earlier chapter that has a state", () => {
    window.ChapterPanel.chapters = [
      ch(1, { story_state: { chapter: 1 } }),
      ch(2),                                   // no state (gap)
      ch(3, { story_state: { chapter: 3 } }),
      ch(4),
    ];
    const [c1, c2, c3, c4] = window.ChapterPanel.chapters;
    expect(CC().priorStateFor(c1)).toEqual({});
    expect(CC().priorStateFor(c2).chapter).toBe(1);
    expect(CC().priorStateFor(c3).chapter).toBe(1);
    expect(CC().priorStateFor(c4).chapter).toBe(3);
  });

  it("markDownstreamStale flags only later chapters that were checked", () => {
    window.ChapterPanel.chapters = [
      ch(1, { story_state: { chapter: 1 } }),
      ch(2, { story_state: { chapter: 2 } }),
      ch(3, { continuity_verdict: "approve" }),
      ch(4),                                   // never checked → left alone
    ];
    const [c1, c2, c3, c4] = window.ChapterPanel.chapters;
    CC().markDownstreamStale(c2);
    expect(c1.state_stale).toBeUndefined();
    expect(c2.state_stale).toBeUndefined();
    expect(c3.state_stale).toBe(true);
    expect(c4.state_stale).toBeUndefined();
  });
});

describe("buildSharedContext", () => {
  it("assembles prior summaries, tail, clues, voices and prior state", () => {
    window.ContextPanel = { exportElementsForLLM: () => [{ label: "L", content: "C" }] };
    window.VoicesPanel.profiles = [{ id: "v", name: "Mara", stages: [] }];
    const words = Array.from({ length: 600 }, (_, i) => `w${i}`).join(" ");
    window.ChapterPanel.chapters = [
      ch(1, { approved: true, summary: "s1", full_text: words, story_state: { chapter: 1 } }),
      ch(2, { approved: false, summary: "s2", full_text: "short" }),
      ch(3),
    ];
    const out = CC().buildSharedContext(window.ChapterPanel.chapters[2]);
    expect(out.context_elements).toEqual([{ label: "L", content: "C" }]);
    expect(out.prior_chapter_summaries).toEqual([{ number: 1, title: "Chapter 1", summary: "s1" }]); // only approved
    expect(out.preceding_chapter_tail).toBe("short");                                             // chapter 2's text
    expect(out.voice_profiles[0].name).toBe("Mara");
    expect(out.prior_state.chapter).toBe(1);
    expect(out.clues_due).toEqual([]);

    const tail = CC().buildSharedContext(window.ChapterPanel.chapters[1]).preceding_chapter_tail;
    expect(tail.split(" ")).toHaveLength(500);                                                    // last 500 words
    expect(tail.startsWith("w100 ")).toBe(true);
  });
});
