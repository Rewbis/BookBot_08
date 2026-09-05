# BookBot_08 — Roadmap & Architecture Reference
*Developed in Claude Code (Windows, PowerShell)*
*Originally generated: 2026-05-04 — last updated: 2026-09-05*

---

## HOW TO USE THIS DOCUMENT

Two layers:
- **Architecture reference** — what exists now and the conventions it follows. Kept accurate against the code; if they disagree, the code wins and this file gets fixed.
- **Roadmap** — what is built, what is partly built, what is planned.

The original scaffold prompts (Gemini "BLOCK 1–13") were removed on 2026-09-05. They described an Ollama-only, streaming, genre/tone/audience-form design that no longer exists. See git history before commit `4ed900e` if you need them.

---

## ARCHITECTURE OVERVIEW

```
BookBot_08/
├── backend/
│   ├── main.py                  # FastAPI app; mounts routers + /static; serves index.html at /
│   ├── routers/
│   │   ├── project.py           # /api/project — save/load/list/new snapshots
│   │   ├── llm.py               # /api/llm — every agent endpoint (see Agent Pipeline)
│   │   ├── research.py          # /api/research — Tavily search/extract + Claude summarise
│   │   ├── tokens.py            # /api/tokens — token counting + session usage/cost
│   │   └── architecture.py      # /api/architecture — serves docs/architecture_matrix.yaml read-only
│   ├── models/
│   │   └── schemas.py           # Pydantic v2: BookProject, Chapter, ContextElement, PlantedClue
│   ├── services/
│   │   ├── claude_service.py    # AsyncAnthropic wrapper (claude-sonnet-5, max_tokens 16000)
│   │   ├── ollama_service.py    # Ollama /api/chat wrapper + strip_thinking(); currently health-check only
│   │   ├── tavily_service.py    # Tavily /search and /extract (Bearer auth)
│   │   └── token_service.py     # tiktoken cl100k approximation
│   └── utils/
│       ├── llm_json.py          # parse_json_response(): strips ```json fences, json.loads
│       ├── model_config.py      # GET /api/llm/config payload: model, context window, warn threshold, $/MTok
│       ├── logger.py            # per-call JSON logs to /logs/
│       ├── snapshot.py          # save/load/suggest_filename
│       └── usage_tracker.py     # session token + USD accumulator (Claude vs local)
├── frontend/
│   ├── index.html               # SPA shell; all <script>/<link> tags carry ?v=N cache-bust
│   ├── css/style.css            # dark theme; mobile breakpoint at ≤1024px
│   └── js/
│       ├── app.js               # init, layout mode (tabs vs long page), divider, tooltips, auto-resize, usage polling
│       ├── context_panel.js     # draggable/toggleable context elements + token bar
│       ├── dump_panel.js        # creative dump → Parse & Structure → slot cards + planted clues
│       ├── research_panel.js    # Tavily URL/search → raw + summary → Approve → Context; paste fallback
│       ├── style_panel.js       # Writing Style: load/paste sample → derive style guide → Approve → Context
│       ├── llm_panel.js         # Phase A loop: Plotter → Antagonist → Revision → Continuity → Summarise
│       ├── chapter_panel.js     # Phase B: chapter cards, Chapter Plan, Skeleton, approve
│       ├── chapter_c_panel.js   # Phase C: draft → enrich → critic → polish → summary; bulk generate
│       ├── architecture_panel.js# Architecture tab renderer
│       └── snapshot.js          # save/load UI; grouped load picker; repopulateUI()
├── docs/
│   ├── architecture_matrix.yaml # hand-edited CRUD matrix + model routing (never written at runtime)
│   └── BookBot_08_Roadmap_and_Instructions.md   # this file
├── tests/                       # pytest — see Testing section
├── pytest.ini                   # testpaths=tests, pythonpath=.
├── author_notes/                # human-only notes; the app never reads this folder (tracked in git)
├── projects/                    # JSON snapshots (gitignored)
├── logs/                        # per-call LLM logs (gitignored)
├── .claude/launch.json          # dev-server config for the Claude Code browser pane
├── requirements.txt
├── .env / .env.example          # ANTHROPIC_API_KEY, TAVILY_API_KEY, OLLAMA_*
└── start.bat
```

**Key principles baked into the architecture:**
- FastAPI binds `0.0.0.0:8000`; reachable over Tailscale from a phone (see Remote Access).
- All LLM state is plain Python dicts / JSON. No LangChain, no framework.
- Every LLM call logs full input + output to `/logs/`.
- Frontend is vanilla HTML/CSS/JS, no build step.
- **Claude Sonnet 5** (`claude-sonnet-5`) via `AsyncAnthropic` for every agent. `max_tokens=16000` (8192 truncated the Antagonist).
  - Sonnet 5 returns `ThinkingBlock` before `TextBlock`. Always `next(b.text for b in response.content if b.type == "text")`, never `content[0].text`.
- **Local Ollama model is not currently invoked for generation.** It is health-checked at startup and in the header dot. The planned `[EXPLICIT: …]` fill pass is not built (see Roadmap).
- `context_elements` is human-curated. Agents read it; only humans write to it, via *Approve → Context* / *Accept* buttons.
- `planted_clues[].status` is `active | blocked`. Agents never delete a clue — Continuity sets `blocked` with a reason so the human can resolve and reinstate.
- `docs/architecture_matrix.yaml` is hand-edited; the Architecture tab loads it read-only.
- Model output that must be JSON goes through `backend/utils/llm_json.parse_json_response()` (fence-tolerant).

---

## AGENT PIPELINE

All agent endpoints are `POST /api/llm/...`, non-streaming, and take `context_elements: [{label, content}]` (the enabled context window, in order) plus `project_title` for logging.

### Phase A — Book Concept Loop

```
Creative Dump → Parse & Structure → [Human slot review → Approve → Context]
                                             ↓
      Research (Tavily) → raw / summary → [Approve → Context]      (optional, any time)
                                             ↓
   Plotter → Antagonist → Plotter Revision ──→ [Edit] → Accept Revision
                    ↑                                      ↓
                    └──── Pass Back to Plotter ←──── Continuity Agent
                                                           ↓
                                                  Approve → Phase B
                                                           ↓
                                    Summarise Premise → [Edit] → Approve → Context
```

| Endpoint | Input | Output | Notes |
|---|---|---|---|
| `/parse-dump` | `dump_text` | `{role_constraints, premise, characters, world_notes, planted_clues[]}` | JSON; clues default `status: "active"` |
| `/plotter` | `context_elements`, `system_prompt_override?` | `{content}` | World dict + plot overview |
| `/antagonist` | `context_elements`, `plotter_output` | `{content}` | Critique list |
| `/plotter-revision` | `context_elements`, `plotter_output`, `antagonist_critique` | `{content}` | On Pass Back, continuity issues are appended to `antagonist_critique` |
| `/continuity` | `context_elements`, `plotter_revision_output`, `planted_clues[]`, `continuity_issues?` | `{verdict, summary, issues[], clue_updates[]}` | JSON; `verdict` is `approve` or `revise` |
| `/summarise-premise` | `context_elements`, `premise` | `{content}` | 200–300 words. Shown with **Edit** + **Approve → Context**; not auto-added |
| `/derive-style-guide` | `style_sample` | `{content}` | 250–350 word style fingerprint written as instructions to a writer |

**Continuity response schema:**
```json
{
  "verdict": "approve | revise",
  "summary": "2–3 sentence assessment",
  "issues": ["..."],
  "clue_updates": [{"id": "clue_id", "status": "active | blocked", "notes": "why"}]
}
```

**UI sequencing after Revision completes:** *Re-run Antagonist Loop*, *Accept Revision as Final*, *Edit*, and *Run Continuity Agent* all appear. Continuity stays disabled until Accept is clicked, because Accept is what puts the revision into context. *Edit* unlocks the revision textarea first.

### Research (Tavily) — `POST /api/research/...`

| Endpoint | Input | Output |
|---|---|---|
| `GET /status` | — | `{tavily_configured}` |
| `/search` | `query`, `max_results=5` | `{query, results[], raw_text}` |
| `/extract` | `url` | `{url, title, content}` (502 if the site blocks scraping) |
| `/summarise` | `raw_content`, `source_label`, `context_elements` | `{content}` — 150–250 word story-relevant summary |

Flow: Go → raw result shown → summarise runs automatically → both *Approve Raw* and *Approve Summary* offered. If Tavily returns an error (login-walled site etc.) an amber paste box appears; pasted text goes through the same summarise + approve path.

### Writing Style (Phase A section)

Load a `.txt`/`.md` (read client-side) or paste a sample of the author's prose. **Derive Style Guide** → editable 250–350 word guide → **Approve Guide → Context** (element type `style_guide`, source `llm`). **Approve Sample → Context** adds the raw text as a `style_sample` element — toggle it off in the context panel when saving tokens. Enrich and Polish prompts are told: follow a *Style Guide* exactly; imitate a *Writing Sample*'s rhythm and register directly. Both are matched by element label, so keep the labels. Place them near the bottom of the context list.

Restored from Authorbot_04, which fed the raw sample to its De-AI editor as the target.

### Phase B — Chapter Outlines

| Endpoint | Input | Output |
|---|---|---|
| `/outliner` | `context_elements`, `prior_skeletons[{number, skeleton}]`, `chapter_number`, `chapter_title`, `intention`, `scene_notes` | `{content}` — 200–400 word skeleton |
| `/chapter-plan` | same, but `chapter_title`/`intention`/`scene_notes` may be empty | `{title, intention, scene_notes, skeleton}` JSON |

*Generate Skeleton* fills only the skeleton. *Generate Chapter Plan* fills all four fields; anything the author has already typed is passed as a **binding seed** and preserved. `prior_skeletons` = approved skeletons of earlier chapters. *Approve & Add to Context* adds the skeleton as a Phase B context element.

### Phase C — Chapter Writing (as built)

```
Draft (Pass 1) → Enrich (Pass 2) → Summarise-enrich → Critic (3a) → Polish (3b) → Summary
```

All Phase C endpoints share `ChapterWriteRequest`: `context_elements`, `prior_chapter_summaries[{number,title,summary}]`, `preceding_chapter_tail`, `chapter_number`, `chapter_title`, `chapter_skeleton`, `current_draft`, `critic_feedback`, `target_words_per_chapter`.

| Endpoint | Reads | Output |
|---|---|---|
| `/chapter-draft` | context, prior summaries, previous-chapter tail (last 500 words), skeleton | Prose with `[DIALOGUE: …]` placeholders |
| `/chapter-enrich` | context, `current_draft` | Dialogue filled, sensory layered, De-AI rules applied |
| `/chapter-summarise-enrich` | `enrich_draft` | 80–120 word summary → `chapter.enrich_draft_summary` |
| `/chapter-critic` | context, prior summaries, `current_draft`, previous `critic_feedback` | Critique |
| `/chapter-polish` | context, `current_draft`, `critic_feedback` | Final prose |
| `/chapter-summary` | `current_draft` | 100–150 words → `chapter.summary` |

- *Generate Chapter* runs the whole chain once (critic/polish × 1). *Re-run Critic* runs critic + polish again on the current text.
- `target_words_per_chapter` = target words ÷ target chapters.
- `prior_chapter_summaries` includes only chapters with `approved == true` and a lower number.
- **Bulk Generate All** runs every unapproved chapter in sequence and marks each approved automatically — there is no per-chapter human gate in bulk mode.
- **Not built:** the `[EXPLICIT: …]` placeholder + local-model fill pass. The drafter prompt never emits that placeholder; `Chapter.has_explicit_content` and `explicit_review_notes` exist in the schema but nothing sets them.

---

## SCHEMA — KEY FIELDS

**`BookProject`**
- `creative_dump`, `role_constraints`, `premise`, `premise_summary`, `characters`, `world_notes`
- `style_sample`, `style_guide` — see Writing Style
- `planted_clues: List[PlantedClue]`
- `plotter_output`, `antagonist_output`, `plotter_revision_output`, `continuity_output` (JSON string) — persisted so a snapshot survives reload mid-loop
- `genre`, `tone`, `audience` — legacy, kept so old snapshots load

**`ContextElement`** — `id`, `label`, `content`, `element_type`, `phase`, `order`, `enabled`, `token_count`, `source`; budget fields `compressed`, `content_full`, `source_ref` (see Context budget)

**`PlantedClue`** — `id`, `label`, `description`, `planted_in`, `pays_off_in`, `status` (`active | blocked`, default `active`)

**`Chapter`**
- Phase B: `title`, `intention`, `scene_notes`, `skeleton`, `approved`, `status`
- Phase C: `draft_text`, `enrich_draft`, `enrich_draft_summary`, `critic_output`, `polish_draft`, `full_text`, `summary`, `phase_c_status`
- Reserved / unused: `has_explicit_content`, `explicit_review_notes`

Note: `Chapter.approved` is set by both Phase B (skeleton approved) and Phase C (prose approved / bulk generate). The two phases share one flag.

---

## ARCHITECTURE TAB

`GET /api/architecture` serves `docs/architecture_matrix.yaml`. `architecture_panel.js` renders the CRUD matrix (sticky first column, wrapping description column, mirrored bottom scrollbar) and the model routing table. Edit the YAML, reload the tab.

The matrix includes a `local_explicit` column and `has_explicit_content` / `explicit_review_notes` rows describing the **planned** local-model pass. Treat those as design intent, not current behaviour.

---

## FRONTEND CONVENTIONS

- **Cache-busting:** every `<script>` and the stylesheet carry `?v=N`. Bump `N` in `index.html` after changing any JS/CSS, or browsers (especially phones) keep the old file. The server does not do this for you.
- **Header buttons use inline `onclick`** (`New`, `Load`, `Save`, mobile tab `<select>`). `addEventListener` bindings made inside `DOMContentLoaded` did not fire on Android; inline handlers did. Do not also bind them in `app.js` — that double-fires on desktop.
- **Layout modes** (`app.js` → `_applyLayoutMode`): ≤1024px shows every phase stacked as one long page and the header dropdown scrolls to a section; wider shows tabs. Re-applied on `resize` when the viewport crosses the breakpoint.
- **Mobile touch:** `touch-action: manipulation` on buttons; inputs are `font-size: 16px` on mobile to stop Android's focus-zoom.
- **Context budget** (`context_panel.js`): the token bar is scaled to `context_warn_tokens` from `GET /api/llm/config` (default 120,000, env `CONTEXT_WARN_TOKENS`; window default 1,000,000, env `CLAUDE_CONTEXT_WINDOW`) and shows an estimated input $/call. At 80% of the threshold a *Context budget* panel lists compressible elements with the tokens each would save; ticking one swaps the element's `content` for its compressed alternative and keeps the original in `content_full` (`compressed: true`, lossless). Alternatives: `chapter_skeleton` → that chapter's `summary`/`enrich_draft_summary` (found via `source_ref` = chapter id, or the `Ch N Skeleton` label for older snapshots); `premise` → `premise_summary`. The threshold is an absolute count on purpose — long-context studies show quality falls gradually from the first tokens with no cliff at the limit, and stale/duplicate material degrades output more than length does.
- **Textareas:** `.streaming-output` auto-grows to content (`autoResize`), is `resize: vertical`, and re-sizes after `llm:complete` and after snapshot load.
- **Tooltips** are `position: fixed`, positioned in JS from `getBoundingClientRect()`, so they escape the context panel's `overflow-y: auto`.

---

## TESTING

```bash
cd E:\Coding\BookBot_08 && .venv\Scripts\python.exe -m pytest -q
```

27 tests (as of 2026-09-05), no network, no API keys:
- `test_model_config.py` — `/api/llm/config` defaults and env overrides
- `test_snapshot.py` — filename sanitising, save/load round-trip of all Phase A fields, legacy snapshots without new fields
- `test_project_api.py` — `/api/project` new/save/list/load/suggest-filename via `TestClient` with `PROJECTS_DIR` pointed at a temp dir
- `test_llm_json.py` — fence-tolerant JSON parsing used by continuity, parse-dump, chapter-plan
- `test_token_service.py`, `test_ollama_service.py` — counting rules, `strip_thinking()`

Not covered: anything that calls Claude/Tavily (`llm.py`, `research.py` instantiate their clients at import, so those modules are not imported by tests), and all frontend JS.

---

## REMOTE ACCESS (Tailscale) ✅

Works from a phone at `http://<tailscale-ip>:8000`. Requirements: server running with `--host 0.0.0.0`, Windows Firewall allowing inbound TCP 8000, and a hard refresh after any `?v=N` bump.

```powershell
New-NetFirewallRule -DisplayName "BookBot 8000" -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow
```

Diagnostic that proved useful: `http://<ip>:8000/api/project/list` in the phone browser confirms the API is reachable independently of the UI.

---

## PHASE ROADMAP

### Phase A — Book Concept Loop ✅
Creative dump → parse → slot review → research → plotter/antagonist/revision loop → continuity → premise summary. Snapshot persists every loop output. Session cost tracker in the sidebar.

### Phase B — Chapter Outlines ✅
Chapter cards (add above/below, reorder, delete with undo), per-chapter intention + scene notes, Generate Skeleton, Generate Chapter Plan (seeded), approve to context.

### Phase C — Chapter Writing ✅ (with gaps)
Draft → enrich → critic → polish → summary per chapter; re-run critic; bulk generate.
Gaps: no local `[EXPLICIT]` fill; bulk mode has no human gate; `approved` flag shared with Phase B.

### Local explicit-content pass ❌ not built
Design: drafter emits `[EXPLICIT: …]`, `qwen3-14b-abliterated` via Ollama fills them, `has_explicit_content` flags the chapter, Critic reviews and writes `explicit_review_notes`. Needs: placeholder instruction in the drafter prompt, an `/api/llm/local-explicit` endpoint calling `ollama_service.generate()` + `strip_thinking()`, a step in `chapter_c_panel.generateChapter()` between draft and enrich, and Critic prompt awareness of the flag.

### Phase D — Export / Marketing / Illustrations — planned
Cover blurb, illustration prompts per chapter, EPUB via `ebooklib`, KDP validation. `ebooklib` is already in `requirements.txt`; nothing else exists.

---

## SMOKE-TEST JOURNEY

1. **New** → set title, target words/chapters.
2. Paste a brain-dump → **Parse & Structure** → review the five slots → **Approve → Context** on each; check clues render with `active` status.
3. Research a URL → confirm raw + summary appear → approve one.
4. **Generate Plot → Run Antagonist → Run Plotter Revision** → *Edit* → *Accept Revision* → **Run Continuity Agent** → verdict shown, clue statuses updated → **Approve → Phase B**.
5. **Summarise Premise** → *Edit* → *Approve → Context*.
6. **Save** → **Load** → the picker groups saves under the project name; pick one; confirm Phase A outputs and clues are restored.
7. Phase B: **Generate Chapter Plan** on an empty chapter, then on one with a typed intention (intention must survive). **Generate Skeleton** → **Approve**.
8. Phase C: **Generate Chapter** on chapter 1 → pills fill draft/enrich/critic/polish → summary appears → **Approve Chapter**. Chapter 2's draft should reference chapter 1's summary.
9. On the phone: page loads as one long scroll, header dropdown jumps between phases, Load opens.

---

## KNOWN LIMITATIONS / NEXT STEPS

- Local explicit-content pass is unimplemented; the hybrid-model design is aspirational until then.
- Bulk Generate auto-approves; no pause-for-review between chapters.
- No per-character voice profiles; character state (knowledge, injuries, location) is not tracked between chapters beyond the free-text summary.
- Context window is a flat ordered list — nothing is retrieved per-chapter by relevance; everything enabled goes into every call.
- Token counter is a cl100k approximation.
- Frontend has no automated tests.
- `?v=N` cache-busting is manual.

---

*End of BookBot_08 Roadmap & Instructions*
