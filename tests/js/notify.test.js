import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadScript } from "./load.js";

const N = () => window.Notify;

beforeAll(() => {
  loadScript("frontend/js/notify.js");
});

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  N().enabled = false;
  N().inflight = 0;
  N().timer = null;
  N()._origTitle = null;
  N().chimes = 0;
  N().chime = () => { N().chimes++; };     // never touch real audio in tests
  document.body.innerHTML = `<button id="btn-notify-toggle"></button>`;
  document.title = "BookBot 08";
});

afterEach(() => {
  vi.useRealTimers();
});

describe("isLLMRequest", () => {
  it("counts only generation POSTs", () => {
    const post = { method: "POST" };
    expect(N().isLLMRequest("/api/llm/plotter", post)).toBe(true);
    expect(N().isLLMRequest("/api/llm/chapter-draft", post)).toBe(true);
    expect(N().isLLMRequest("/api/research/summarise", post)).toBe(true);
    expect(N().isLLMRequest("http://localhost:8000/api/llm/continuity", post)).toBe(true);

    expect(N().isLLMRequest("/api/llm/provider", post)).toBe(false);   // switching models is not a run
    expect(N().isLLMRequest("/api/llm/health")).toBe(false);           // GET
    expect(N().isLLMRequest("/api/llm/config", { method: "get" })).toBe(false);
    expect(N().isLLMRequest("/api/tokens/count", post)).toBe(false);
    expect(N().isLLMRequest("/api/project/save", post)).toBe(false);
  });

  it("reads the method from a Request-like object", () => {
    expect(N().isLLMRequest({ url: "/api/llm/antagonist", method: "POST" })).toBe(true);
    expect(N().isLLMRequest({ url: "/api/llm/antagonist", method: "GET" })).toBe(false);
  });
});

describe("idle detection", () => {
  it("chimes once after a run of back-to-back calls, only when enabled", () => {
    N().enabled = true;
    for (let i = 0; i < 5; i++) { N().begin(); N().end(); }   // draft → enrich → … with no gaps
    expect(N().chimes).toBe(0);
    vi.advanceTimersByTime(N().DEBOUNCE_MS - 1);
    expect(N().chimes).toBe(0);
    vi.advanceTimersByTime(1);
    expect(N().chimes).toBe(1);
  });

  it("does not chime while something is still in flight", () => {
    N().enabled = true;
    N().begin(); N().begin(); N().end();
    vi.advanceTimersByTime(N().DEBOUNCE_MS * 2);
    expect(N().chimes).toBe(0);
    N().end();
    vi.advanceTimersByTime(N().DEBOUNCE_MS);
    expect(N().chimes).toBe(1);
  });

  it("a new call inside the debounce window cancels the pending chime", () => {
    N().enabled = true;
    N().begin(); N().end();
    vi.advanceTimersByTime(N().DEBOUNCE_MS - 100);
    N().begin();                       // bulk mode starting the next chapter
    vi.advanceTimersByTime(N().DEBOUNCE_MS * 2);
    expect(N().chimes).toBe(0);
    N().end();
    vi.advanceTimersByTime(N().DEBOUNCE_MS);
    expect(N().chimes).toBe(1);
  });

  it("stays silent when disabled and never goes negative", () => {
    N().enabled = false;
    N().end(); N().end();
    expect(N().inflight).toBe(0);
    N().begin(); N().end();
    vi.advanceTimersByTime(N().DEBOUNCE_MS);
    expect(N().chimes).toBe(0);
  });
});

describe("fetch wrapper", () => {
  it("tracks matching requests and leaves the caller's promise untouched", async () => {
    window.__bb8FetchWrapped = false;
    const calls = [];
    window.fetch = (input) => { calls.push(input); return Promise.resolve({ ok: true, tag: input }); };
    N().wrapFetch();
    N().enabled = true;

    const r1 = await window.fetch("/api/llm/plotter", { method: "POST" });
    const r2 = await window.fetch("/api/tokens/usage");
    expect(r1.tag).toBe("/api/llm/plotter");
    expect(r2.tag).toBe("/api/tokens/usage");
    expect(calls).toHaveLength(2);
    expect(N().inflight).toBe(0);
    vi.advanceTimersByTime(N().DEBOUNCE_MS);
    expect(N().chimes).toBe(1);        // only the LLM call produced a chime
  });

  it("counts a rejected request as finished", async () => {
    window.__bb8FetchWrapped = false;
    window.fetch = () => Promise.reject(new Error("boom"));
    N().wrapFetch();
    N().enabled = true;
    await expect(window.fetch("/api/llm/plotter", { method: "POST" })).rejects.toThrow("boom");
    expect(N().inflight).toBe(0);
  });
});

describe("toggle + title", () => {
  it("persists the preference and updates the button", () => {
    const btn = document.getElementById("btn-notify-toggle");
    N().toggle(btn);
    expect(N().enabled).toBe(true);
    expect(localStorage.getItem(N().KEY)).toBe("1");
    expect(btn.textContent).toBe("🔔");
    expect(btn.classList.contains("active")).toBe(true);
    expect(N().chimes).toBe(1);        // audible confirmation on enable
    N().toggle(btn);
    expect(localStorage.getItem(N().KEY)).toBe("0");
    expect(btn.textContent).toBe("🔕");
    expect(N().chimes).toBe(1);        // silent on disable
  });

  it("init restores the saved preference", () => {
    localStorage.setItem(N().KEY, "1");
    N().init();
    expect(N().enabled).toBe(true);
    expect(document.getElementById("btn-notify-toggle").textContent).toBe("🔔");
  });

  it("flags the tab title only while hidden, and restores it", () => {
    N().enabled = true;
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    N().ready();
    expect(document.title).toBe("🔔 Ready — BookBot 08");
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    N().clearTitle();
    expect(document.title).toBe("BookBot 08");
    N().ready();                        // visible: title untouched
    expect(document.title).toBe("BookBot 08");
  });
});
