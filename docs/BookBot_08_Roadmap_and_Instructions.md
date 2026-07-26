# BookBot_08 — Roadmap & Architecture Reference
*Developed in Claude Code (Windows, PowerShell)*
*Originally generated: 2026-05-04 — last updated: 2026-07-25*

---

## HOW TO USE THIS DOCUMENT

This document has two layers:
- **Roadmap** — phased plan, what gets built when, and why
- **Architecture reference** — describes the current structure and conventions

---

## ARCHITECTURE OVERVIEW

```
BookBot_08/
├── backend/
│   ├── main.py              # FastAPI app entry point
│   ├── routers/
│   │   ├── project.py       # save/load JSON snapshots
│   │   ├── llm.py           # LLM call endpoints (all agents — see Agent Pipeline below)
│   │   ├── tokens.py        # token counting + session usage endpoints
│   │   └── architecture.py  # serves docs/architecture_matrix.yaml read-only
│   ├── models/
│   │   └── schemas.py       # Pydantic data models (BookProject, Chapter, ContextElement, etc.)
│   ├── services/
│   │   ├── ollama_service.py   # wraps Ollama /api/chat (local model)
│   │   ├── claude_service.py   # wraps Anthropic API (AsyncAnthropic, claude-sonnet-5)
│   │   └── token_service.py    # counts tokens per element (tiktoken cl100k approx)
│   └── utils/
│       ├── logger.py        # per-call JSON logs to /logs/
│       ├── snapshot.py      # JSON save/load helpers
│       └── usage_tracker.py # session token + cost accumulator (Claude vs local)
├── frontend/
│   ├── index.html           # single page app shell
│   ├── css/
│   │   └── style.css
│   └── js/
│       ├── app.js             # init, tab switching, usage tracker polling, resizable panels
│       ├── context_panel.js   # draggable/toggleable context element list
│       ├── dump_panel.js      # creative dump parsing, slot editing, planted clues
│       ├── llm_panel.js       # Phase A loop: Plotter → Antagonist → Revision → Continuity
│       ├── chapter_panel.js   # Phase B chapter outline UI
│       ├── chapter_c_panel.js # Phase C 3-pass writing pipeline
│       ├── architecture_panel.js # Architecture tab: CRUD matrix + model routing table
│       └── snapshot.js        # save/load UI
├── docs/
│   ├── architecture_matrix.yaml  # hand-edited CRUD matrix and model routing table
│   └── BookBot_08_Roadmap_and_Instructions.md  # this file
├── projects/                # JSON snapshot files live here
├── logs/                    # per-call LLM input/output logs
├── requirements.txt         # includes pyyaml for YAML loading
├── .env                     # API keys — never commit this
├── .env.example
└── start.bat                # Windows one-click start; prints checklist (start Ollama first)
```

**Key principles baked into the architecture:**
- FastAPI binds to `0.0.0.0:8000` (future Tailscale remote access, zero refactor needed)
- Ollama called via HTTP at `localhost:11434` — model stays warm between calls
- All LLM state held in Python dicts/JSON — no LangChain, no abstraction
- Every LLM call logs full input + output to `/logs/` for auditability
- Frontend is plain HTML/CSS/JS — no build step, no framework, runs in any browser
- Claude Sonnet 5 (`claude-sonnet-5`) via `AsyncAnthropic` for all frontier calls
  - Sonnet 5 may return `ThinkingBlock` objects before `TextBlock` — always extract text with
    `next(b.text for b in response.content if b.type == "text")`, not `content[0].text`
- Local Ollama model (`qwen3-14b-abliterated`) used only for `[EXPLICIT: ...]` placeholder fill
- `context_elements` is human-curated; agents READ it but never write to it directly
- `planted_clues[].status` is never deleted by agents — set to `"cut"` with notes
- `docs/architecture_matrix.yaml` is hand-edited; the Architecture tab loads it read-only
- Left/right panel split is resizable via drag divider; width saved to `localStorage`

---

## AGENT PIPELINE

### Phase A — Book Concept Loop

```
Parse & Structure  →  [Human slot review]
        ↓
     Plotter  →  Antagonist  →  Plotter Revision  →  Continuity Agent
                                        ↑_____________________________|
                                        (Pass Back if issues found)
                                                     |
                                              Approve → Phase B
                                                     |
                                         Summarise Premise (auto-add to context)
```

**Endpoints (`POST /api/llm/...`):**

| Endpoint | Input | Output | Notes |
|---|---|---|---|
| `/parse-dump` | `creative_dump`, `project_title` | `{role_constraints, premise, characters, world_notes, planted_clues}` | Structured JSON from raw brain-dump |
| `/plotter` | `context_elements`, `project_title` | `{content}` | World dict + plot overview |
| `/antagonist` | `context_elements`, `plotter_output`, `project_title` | `{content}` | Critique list |
| `/plotter-revision` | `context_elements`, `plotter_output`, `antagonist_critique`, `project_title` | `{content}` | Revised plan; `antagonist_critique` may include appended continuity issues on re-run |
| `/continuity` | `context_elements`, `plotter_revision_output`, `planted_clues`, `continuity_issues`, `project_title` | `{verdict, summary, issues, clue_updates}` | JSON response (fences stripped); `verdict` is `"approve"` or `"revise"` |
| `/summarise-premise` | `context_elements`, `premise`, `project_title` | `{content}` | 200–300 word compressed premise; auto-added to context as `premise_summary` element |

**Continuity Agent response schema:**
```json
{
  "verdict": "approve | revise",
  "summary": "one-paragraph assessment",
  "issues": ["issue text", "..."],
  "clue_updates": [
    {"id": "clue-uuid", "status": "planted | paid_off | cut", "notes": "reason"}
  ]
}
```

**Pass Back loop:** "Pass Back to Plotter" extracts `issues` from the continuity response and calls `runRevision(issueText)` — Plotter Revision re-runs with the continuity issues appended to the antagonist critique. No new endpoint needed.

### Phase B — Chapter Outlines

| Endpoint | Input | Output |
|---|---|---|
| `/outliner` | `context_elements`, `chapters[]`, `premise_summary`, `project_title` | `{content}` streaming |

### Phase C — 3-Pass Chapter Writing

```
Drafter (Pass 1)  →  [Local model fills EXPLICIT placeholders]
        ↓
  Enricher (Pass 2)  →  Summariser (post-enrich)
        ↓
  Critic (Pass 3a)  →  Polish (Pass 3b)  →  Summariser (post-polish)
```

| Endpoint | Input | Output | Notes |
|---|---|---|---|
| `/chapter-draft` | `context_elements`, `chapter`, `prev_chapter_summaries`, `prev_chapter_tail`, `project_title` | streaming | Pass 1 prose with `[DIALOGUE: ...]` and `[EXPLICIT: ...]` placeholders |
| `/local-explicit` | `draft_text`, `project_title` | `{content, has_explicit}` | Ollama only; fills `[EXPLICIT: ...]` markers |
| `/chapter-enrich` | `context_elements`, `chapter`, `draft_text`, `project_title` | streaming | Fills dialogue, layers sensory detail, applies De-AI rules |
| `/chapter-summarise-enrich` | `chapter_number`, `chapter_title`, `enrich_draft`, `project_title` | `{content}` | 80–120 word summary of enrich pass; stored as `chapter.enrich_draft_summary` |
| `/chapter-critic` | `context_elements`, `chapter`, `enrich_draft`, `project_title` | streaming | Literary critique pass |
| `/chapter-polish` | `context_elements`, `chapter`, `enrich_draft`, `critic_output`, `project_title` | streaming | Final prose addressing critique |
| `/chapter-summary` | `chapter_number`, `chapter_title`, `polish_draft`, `project_title` | `{content}` | 100–150 word factual chapter summary for subsequent chapter context |

---

## SCHEMA — KEY FIELDS

**`BookProject`** (project-level, in `schemas.py`):
- `premise_summary: str` — compressed premise from Summariser; read by Outliner and Drafter
- `plotter_output: str` — persisted Plotter output
- `antagonist_output: str` — persisted Antagonist critique
- `plotter_revision_output: str` — persisted Revision output
- `continuity_output: str` — persisted Continuity Agent JSON string

**`Chapter`** (per-chapter):
- `draft_text: str` — Pass 1 (Drafter + local explicit fill)
- `enrich_draft: str` — Pass 2 (Enricher)
- `enrich_draft_summary: str` — compressed enrich_draft for context economy
- `critic_output: str` — Pass 3a critique
- `polish_draft: str` — Pass 3b final prose
- `summary: str` — 100–150 word post-polish summary
- `has_explicit_content: bool` — true if local model ran
- `explicit_review_notes: str` — Critic notes on explicit passages

---

## ARCHITECTURE DOCUMENTATION TAB

The Architecture tab in the UI (`GET /api/architecture`) serves `docs/architecture_matrix.yaml` read-only.

This YAML file contains two tables, rendered in the frontend by `architecture_panel.js`:

1. **CRUD Matrix** — shows which agents Create / Read / Update / Delete each field.  
   - First column is frozen (sticky) during horizontal scroll.
   - Description column wraps text.
   - Sticky bottom scrollbar via mirrored ghost div + bidirectional scroll sync.

2. **Model Routing Table** — shows which LLM (Claude API or local Ollama) each agent uses per pipeline phase.

**To update the tables:** edit `docs/architecture_matrix.yaml` directly and reload the Architecture tab. The file is never written at runtime.

---

## PHASE ROADMAP

### Phase A — Book Concept Loop ✅ COMPLETE
**Goal:** Working end-to-end loop for a single book concept.

Features built:
- **Creative Dump** — paste raw ideas; "Parse & Structure" agent fills structured slots (role constraints, premise, characters, world notes, planted clues)
- **Slot review** — human reviews and edits each parsed slot; "Approve → Context" promotes a slot into the context panel
- **Planted Clues** — discrete foreshadowing items with label, description, status, and arc reference; Continuity Agent updates status
- **Context panel** — draggable, toggleable elements with token counts and running total
- **Phase A loop:** Generate Plot → Run Antagonist → Run Plotter Revision → Run Continuity Agent
  - Continuity Agent returns structured JSON: verdict (approve/revise), issues, clue status updates
  - "Pass Back to Plotter": re-runs Plotter Revision with continuity issues appended
  - "Approve → Phase B": locks plan, reveals Summarise Premise
- **Summarise Premise** — 200–300 word compressed premise auto-added to context; used by Outliner and Drafter
- **Snapshot save/load** — persists all Phase A loop outputs (plotter, antagonist, revision, continuity JSON, premise summary)
- **Architecture tab** — read-only CRUD matrix and model routing table rendered from `docs/architecture_matrix.yaml`
- **Resizable panels** — drag vertical divider; split saved to localStorage
- **Session cost tracker** — Claude API token usage and cost shown in sidebar

**Done when:** Full loop from creative dump through Continuity Agent approval and premise summary runs without error.

---

### V2 — Phase B (Chapter Outlines & Skeleton)
- Chapter list UI: add above/below, delete, reorder
- Per-chapter: intention text box + scene/notes text box
- Outliner LLM: takes approved Phase A elements + chapter intentions → full book skeleton
- Skeleton output: editable per-chapter in UI
- Token-aware: skeleton passed in chunks if needed
- LLM-generated chapter summaries (human-editable) stored per chapter

---

### Phase C — Full Chapter Writing (in progress)
3-pass pipeline per chapter (built; UI integration ongoing):

1. **Draft (Pass 1)** — full prose with sensory atmosphere, events, `[DIALOGUE: ...]` and `[EXPLICIT: ...]` placeholders. Local model fills `[EXPLICIT: ...]` and sets `has_explicit_content` flag.
2. **Enrich (Pass 2)** — fills dialogue, layers sensory detail, applies De-AI rules (scrubs LLM hallmarks: banned words, em-dash overuse, hedging language, formulaic transitions). Summariser runs after enrich: 80–120 word summary stored as `enrich_draft_summary`.
3. **Critic → Polish (Pass 3)** — literary critique (Pass 3a) then polish addressing the critique (Pass 3b). Re-runnable. Summariser runs after polish: 100–150 word factual summary stored as `chapter.summary`.

Previous chapters passed as summaries (not full text). Last 500 words of preceding chapter passed as tail context. Bulk generation option with per-chapter approval gate.

---

### Hybrid Model Architecture
BookBot uses two LLM backends:

| Role | Model | Used for |
|------|-------|----------|
| **Frontier** | `claude-sonnet-5` (Anthropic API) | All agents except explicit content fill |
| **Local** | `qwen3-14b-abliterated` via Ollama | `[EXPLICIT: ...]` placeholder fill only |

Cost is tracked per-model in the sidebar: sent/received tokens and session cost in USD for Claude; free for local.  
Set `ANTHROPIC_API_KEY` in `.env` to enable the Claude path. Ollama must be running before the server starts — `start.bat` prints a reminder checklist.

**Important implementation note:** Claude Sonnet 5 uses extended thinking by default and returns `ThinkingBlock` objects before `TextBlock` in `response.content`. Never index `content[0].text` — always filter: `next(b.text for b in response.content if b.type == "text")`.

---

### V4 — Phase D+E (Marketing, Illustrations, EPUB)
*(tavily_service.py and epub_service.py are planned but not yet built)*
- Visualiser LLM: generates illustration prompts per chapter (key scene from chapter start)
- Cover blurb generation
- Illustration prompt display (copy to clipboard for Gemini/etc.)
- Folder watcher: detects images dropped into `/projects/[title]/illustrations/`
- EPUB assembly via `ebooklib`: chapter text + images + TOC + alt text + metadata
- KDP-ready output: validates against known KDP epub requirements
- Companion file: cover blurb, suggested title/subtitle, author field

---

### V5 — Remote Access
- Confirm FastAPI is already on `0.0.0.0` (it will be from day one)
- Install Tailscale on desktop + phone
- Access `http://[tailscale-ip]:8000` from phone browser
- No code changes required

---

## IDE INSTRUCTIONS — PASTE THESE INTO GEMINI PANEL IN ORDER

---

### BLOCK 1 — Project Setup

```
Create a new project folder called BookBot_08 in the current workspace.

Inside BookBot_08, create the following folder structure exactly:
- backend/routers/
- backend/models/
- backend/services/
- backend/utils/
- frontend/css/
- frontend/js/
- projects/
- logs/

Create a Python virtual environment in BookBot_08 using:
  python -m venv .venv

Create a requirements.txt file in BookBot_08 with these contents:
  fastapi
  uvicorn[standard]
  python-dotenv
  httpx
  pydantic
  tiktoken
  tavily-python
  ebooklib

Create a .env.example file with:
  TAVILY_API_KEY=your_key_here
  OLLAMA_BASE_URL=http://localhost:11434
  OLLAMA_MODEL=richardyoung/qwen3-14b-abliterated:Q5_K_M

Create a .env file with the same contents (user will fill in Tavily key).

Create start.bat in BookBot_08 with:
  @echo off
  call .venv\Scripts\activate
  uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
  pause
```

---

### BLOCK 2 — Data Schemas

```
In BookBot_08/backend/models/schemas.py, create Pydantic models for the following:

1. ContextElement
   Fields:
   - id: str (uuid)
   - label: str (human-readable name, e.g. "Book Concept", "Plot Point 3")
   - content: str
   - element_type: str (e.g. "concept", "plot_point", "world_dict", "chapter_summary", "user_note")
   - phase: str (e.g. "A", "B", "C")
   - order: int
   - enabled: bool (default True)
   - token_count: int (default 0)
   - source: str (e.g. "human", "llm", "tavily")
   - created_at: str (ISO datetime)
   - updated_at: str (ISO datetime)

2. Chapter
   Fields:
   - id: str (uuid)
   - number: int
   - title: str
   - intention: str (user's fixed point / intention for this chapter)
   - scene_notes: str
   - skeleton: str (LLM-generated outline)
   - summary: str (LLM-generated, human-editable)
   - full_text: str
   - order: int
   - status: str (e.g. "empty", "outlined", "drafted", "approved")

3. BookProject
   Fields:
   - id: str (uuid)
   - title: str
   - genre: str
   - tone: str
   - audience: str
   - target_word_count: int
   - target_chapter_count: int
   - phase: str (current phase: "A", "B", "C", "D")
   - context_elements: list of ContextElement
   - chapters: list of Chapter
   - world_dict: dict (flexible, LLM-generated)
   - antagonist_rounds: int (default 1)
   - model_name: str
   - created_at: str
   - updated_at: str
   - snapshot_notes: str

All models should use Pydantic v2 syntax. Add a Config class with populate_by_name = True where needed.
```

---

### BLOCK 3 — Ollama Service

```
In BookBot_08/backend/services/ollama_service.py, create an async service class OllamaService with:

1. __init__ method reading OLLAMA_BASE_URL and OLLAMA_MODEL from environment variables.

2. async method: generate(messages: list[dict], stream: bool = True) -> AsyncGenerator[str, None]
   - Calls POST http://localhost:11434/api/chat
   - Uses the chat endpoint (not /api/generate) so we pass a messages array in OpenAI format
   - If stream=True, yields text chunks as they arrive (for live UI updates)
   - If stream=False, returns full response string
   - Logs full request payload and full response to /logs/ as a JSON file named {timestamp}_{role}.json
   - Role can be "plotter", "antagonist", "outliner", "copywriter", "editor", "visualiser"

3. async method: health_check() -> bool
   - Calls GET http://localhost:11434/api/tags
   - Returns True if Ollama is running, False otherwise

4. Use httpx.AsyncClient for all HTTP calls. Set a timeout of 300 seconds (local LLM can be slow).

5. Include clear comments explaining what each method does and what the messages format looks like.
   Example messages format comment:
   # messages = [
   #   {"role": "system", "content": "You are a creative writing assistant..."},
   #   {"role": "user", "content": "Write a chapter outline for..."}
   # ]

Note: Do NOT load/unload the model. Ollama manages model warmth automatically.
```

---

### BLOCK 4 — Token Service

```
In BookBot_08/backend/services/token_service.py, create a TokenService class with:

1. count_tokens(text: str) -> int
   - Uses tiktoken with the "cl100k_base" encoding (good approximation for most modern LLMs)
   - Returns integer token count
   - Note in a comment: this is an approximation for Qwen3; exact counts may vary slightly

2. count_elements(elements: list[dict]) -> list[dict]
   - Takes a list of context element dicts
   - Returns same list with token_count field populated for each element

3. total_tokens(elements: list[dict]) -> int
   - Returns sum of token counts for all enabled elements only (where enabled == True)

In BookBot_08/backend/routers/tokens.py, create FastAPI router with:

POST /api/tokens/count
   - Accepts: {"text": "some string"}
   - Returns: {"token_count": 123}

POST /api/tokens/elements
   - Accepts: list of context element objects
   - Returns: same list with token_count populated + {"total": 456}

GET /api/tokens/usage
   - Returns session-level token and cost summary:
     {"claude": {"input_tokens": N, "output_tokens": N, "cost_usd": N},
      "local":  {"input_tokens": N, "output_tokens": N, "cost_usd": 0},
      "total_cost_usd": N}

POST /api/tokens/usage/reset
   - Resets session counters to zero
   - Returns: {"status": "reset"}
```

---

### BLOCK 5 — Snapshot Service (Save/Load)

```
In BookBot_08/backend/utils/snapshot.py, create:

1. save_snapshot(project: BookProject, filepath: str) -> str
   - Serialises project to pretty-printed JSON (indent=2)
   - Writes to filepath (which will be in /projects/ folder)
   - Returns the filepath written
   - Updates project.updated_at to current ISO datetime before saving

2. load_snapshot(filepath: str) -> BookProject
   - Reads JSON file from filepath
   - Deserialises into BookProject Pydantic model
   - Returns BookProject object

3. suggest_filename(project: BookProject) -> str
   - Returns a suggested filename string like:
     bookbot_{sanitised_title}_{YYYYMMDD}_{HHMM}.json
   - Sanitise title: lowercase, spaces to underscores, remove special chars

In BookBot_08/backend/routers/project.py, create FastAPI router with:

POST /api/project/save
   - Accepts BookProject + optional custom_filename string
   - If no custom_filename, uses suggest_filename()
   - Saves to /projects/ folder
   - Returns {"filepath": "...", "filename": "..."}

POST /api/project/load
   - Accepts {"filepath": "..."}
   - Returns full BookProject object

GET /api/project/list
   - Returns list of .json files in /projects/ folder with filename, size, modified date

GET /api/project/suggest-filename
   - Accepts project title as query param
   - Returns suggested filename string

POST /api/project/new
   - Creates and returns a blank BookProject with a new UUID and current timestamp
```

---

### BLOCK 6 — LLM Router (Phase A Prompts)

```
In BookBot_08/backend/routers/llm.py, create a FastAPI router with these endpoints.
Import OllamaService and use it for all LLM calls.
All endpoints accept a "context_elements" list (ordered, enabled items only — frontend handles filtering).
All endpoints stream responses back using FastAPI's StreamingResponse.

ENDPOINT 1: POST /api/llm/plotter
Accepts:
  - context_elements: list of {label, content} dicts (in order — this IS the context window)
  - system_prompt_override: optional str
  - role_name: str = "plotter"

Behaviour:
  - Builds system prompt: "You are a creative writing plotter. Your role is to build a rich, coherent story world and plot structure based on the author's inputs. Return a structured world dictionary covering: characters (with motivations, voice, arc), locations, key events, themes, and a plot overview. Be specific and inventive."
  - Builds user message from context_elements: each element becomes "## {label}\n{content}\n"
  - Calls OllamaService.generate(messages, stream=True)
  - Streams response back to frontend
  - Logs full call

ENDPOINT 2: POST /api/llm/antagonist
Accepts:
  - context_elements: list (same format)
  - plotter_output: str (the plotter's previous response, always included)
  - system_prompt_override: optional str

Behaviour:
  - System prompt: "You are a critical editor and story antagonist. Your role is to identify weaknesses, plot holes, inconsistencies, underdeveloped characters, and missed opportunities in the story plan provided. Be specific, constructive, and rigorous. List your critiques clearly."
  - User message includes plotter_output at the end, labelled "## Plotter Output\n{plotter_output}"
  - Stream response back

ENDPOINT 3: POST /api/llm/plotter-revision
Accepts:
  - context_elements: list
  - plotter_output: str
  - antagonist_critique: str
  - system_prompt_override: optional str

Behaviour:
  - System prompt: same as plotter but adds "You are revising your previous plan in response to editorial critique. Address the valid criticisms. Do not mention the critique process in your output — just produce an improved plan."
  - User message includes both plotter_output and antagonist_critique, clearly labelled
  - Stream response back

For ALL endpoints:
  - Accept an optional log_label: str for the log filename
  - Return StreamingResponse with media_type="text/plain"
  - Add CORS middleware in main.py so the frontend (same machine, different port during dev) can call these
```

---

### BLOCK 7 — FastAPI Main App

```
In BookBot_08/backend/main.py, create the FastAPI application:

1. Import and include routers: project, llm, tokens
2. Add CORS middleware allowing all origins (localhost dev — not a security risk on local machine)
3. Bind to host 0.0.0.0 (important for future remote access via Tailscale)
4. Serve the frontend/index.html as the root route GET /
5. Mount the frontend/ folder as StaticFiles at /static
6. On startup: check Ollama health via OllamaService.health_check() and log result to console
7. Load .env using python-dotenv at the top of the file

Add this startup event handler:
  - If Ollama is not reachable, print a clear warning but don't crash the app
  - Print the local URL: "BookBot running at http://localhost:8000"
  - Print the network URL: "Remote access (Tailscale): http://0.0.0.0:8000 — configure Tailscale to use"
```

---

### BLOCK 8 — Frontend: HTML Shell

```
Create BookBot_08/frontend/index.html as a single-page application shell.

Structure:
- Header bar: app title "BookBot 08", current project title (editable inline), save/load buttons, Ollama status indicator (green/red dot)
- Main area split into two columns:
  LEFT COLUMN (40% width): Context Panel
  RIGHT COLUMN (60% width): Work Panel with tabs

Context Panel (left):
- Title: "Context Window"
- Running token total at top: "Total tokens to send: [N] / 32,000" with a colour-coded bar (green < 20k, amber < 28k, red > 28k)
- List of context elements, each showing:
    - Drag handle (⠿ icon) on the left
    - Checkbox (toggles enabled/disabled, greyed out when disabled)
    - Label (bold)
    - Content preview (first 80 chars, truncated)
    - Token count badge (e.g. "143 tok")
    - Small edit button (pencil icon)
- "Add Element" button at bottom

Work Panel tabs (right):
- Tab A: Book Concept (Phase A)
- Tab B: Chapter Outlines (Phase B — greyed out in MVP, shows "Coming in V2")
- Tab C: Chapter Writing (Phase C — greyed out in MVP)
- Tab D: Marketing & Export (Phase D — greyed out in MVP)

Tab A content:
- Book setup form: Title, Genre, Tone/Style, Audience, Target word count, Target chapter count
- Fixed plot points section: ordered list, each point has text input + up/down/delete buttons
- Tavily research query box + "Research" button (optional, adds result as context element)
- Generation Controls section:
    - "Antagonist Rounds" number input (default 1, min 0)
    - System prompt display box (editable, shows what will be sent as system prompt)
    - [Generate Plot] button → triggers plotter endpoint
    - Output streams into a text area below
    - [Accept Output] button → saves as context element
    - [Edit & Accept] → makes output editable, then accept
    - [Regenerate] → re-runs with same inputs
    - After plotter output accepted: [Run Antagonist] button appears
    - After antagonist: [Run Plotter Revision] button appears
    - [Re-run Antagonist Loop] button (triggers N+1 round manually)

All buttons disabled with clear tooltip if Ollama is offline.
Use semantic HTML. No frameworks. Link to /static/css/style.css and /static/js/app.js.
```

---

### BLOCK 9 — Frontend: Context Panel JS

```
Create BookBot_08/frontend/js/context_panel.js

This module manages the context panel on the left side of the UI.

State it manages:
  - contextElements: array of element objects (id, label, content, token_count, enabled, order)

Functions to implement:

1. renderContextPanel()
   - Renders the full element list into the DOM
   - Each element is a draggable div (use HTML5 drag-and-drop API, not a library)
   - Shows: drag handle, checkbox, label, preview, token count badge, edit button
   - Disabled elements rendered with 50% opacity and strikethrough on label
   - Calls updateTokenTotal() after render

2. updateTokenTotal()
   - Sums token_count for all enabled elements
   - Updates the total display
   - Colours the bar: green/amber/red based on thresholds (20k/28k)

3. addElement(label, content, source, element_type)
   - Creates new element object with generated id, current timestamp
   - Calls /api/tokens/count to get token count for content
   - Appends to contextElements array
   - Re-renders panel

4. toggleElement(id)
   - Flips enabled boolean on element with given id
   - Re-renders

5. reorderElements(draggedId, targetId)
   - Moves dragged element to position of target in array
   - Updates order field on all elements
   - Re-renders

6. editElement(id)
   - Opens an inline edit modal/overlay showing full content in a textarea
   - Has [Confirm Edit] and [Cancel] buttons
   - On confirm: updates element content, re-fetches token count, re-renders

7. getEnabledElements()
   - Returns array of enabled elements sorted by order
   - Used by llm_panel.js when building API calls

8. exportElementsForLLM()
   - Returns list of {label, content} dicts for enabled elements in order
   - This is what gets sent to the backend LLM endpoints

Make all functions available on a global ContextPanel object (e.g. window.ContextPanel = {...})
```

---

### BLOCK 10 — Frontend: LLM Panel JS

```
Create BookBot_08/frontend/js/llm_panel.js

This module handles all LLM generation interactions in the Work Panel.

State it manages:
  - plotterOutput: str
  - antagonistOutput: str
  - revisionOutput: str
  - currentRound: int
  - isGenerating: bool

Functions to implement:

1. runPlotter()
   - Gets enabled elements from ContextPanel.exportElementsForLLM()
   - Gets system prompt from the editable system prompt box in the UI
   - POSTs to /api/llm/plotter with streaming fetch
   - Reads the stream chunk by chunk and appends to the output textarea in real time
   - Shows a "Generating..." spinner, disables all generation buttons during generation
   - On complete: enables [Accept Output], [Edit & Accept], [Regenerate] buttons
   - Saves plotterOutput to state

2. runAntagonist()
   - Same pattern as runPlotter but calls /api/llm/antagonist
   - Includes plotterOutput in request body
   - Streams to a separate antagonist output textarea
   - On complete: enables [Run Plotter Revision]

3. runRevision()
   - Calls /api/llm/plotter-revision
   - Includes both plotterOutput and antagonistOutput
   - Streams to a new revision output textarea
   - Increments currentRound
   - On complete: enables [Re-run Antagonist Loop] and [Accept Revision as Final]

4. acceptOutput(outputType)
   - outputType: "plotter", "antagonist", "revision"
   - Calls ContextPanel.addElement() with appropriate label and content
   - Locks the accepted output textarea (read-only with a green "Accepted" badge)

5. showGeneratingState(bool)
   - Disables/enables all buttons
   - Shows/hides spinner

6. handleStreamResponse(response, targetTextareaId)
   - Generic streaming reader
   - Uses response.body ReadableStream
   - Decodes chunks and appends to target textarea

Make all functions available on window.LLMPanel = {...}
Emit a custom DOM event "llm:complete" when any generation finishes, so other modules can react.
```

---

### BLOCK 11 — Frontend: Snapshot JS + App Init

```
Create BookBot_08/frontend/js/snapshot.js

Functions:

1. saveProject()
   - Gathers current project state from all UI panels
   - POSTs to /api/project/save
   - Shows suggested filename in an editable text input dialog
   - User can edit filename or accept
   - On save: shows "Saved to projects/{filename}" confirmation

2. loadProject()
   - GETs /api/project/list to show available snapshots
   - Displays list in a modal with filename, date, size
   - User clicks to load
   - POSTs to /api/project/load
   - Populates all UI panels with loaded data (calls repopulateUI())

3. repopulateUI(project)
   - Takes a full BookProject object
   - Populates: book setup form fields, fixed plot points list, context elements panel
   - Updates page title with project title

4. newProject()
   - Confirms with user ("Start new project? Unsaved changes will be lost.")
   - POSTs to /api/project/new
   - Calls repopulateUI with blank project

---

Create BookBot_08/frontend/js/app.js

This is the entry point. On DOMContentLoaded:

1. Import/reference all modules (ContextPanel, LLMPanel, Snapshot)
2. Bind all button click events
3. Check Ollama status: GET /api/llm/health (add this endpoint to llm router)
   - Update the status dot in header: green if OK, red if offline
   - Poll every 30 seconds
4. Initialise a blank project on first load
5. Set up the tab switching logic for Work Panel tabs

---

Create BookBot_08/frontend/css/style.css

Design requirements:
- Dark theme (background #1a1a2e, panels #16213e, text #e0e0e0)
- Accent colour: deep amber #f0a500
- Two-column layout using CSS Grid
- Context panel elements: card style, subtle border, hover highlight
- Token count badge: monospace font, small, amber background
- Generation buttons: large, clear, distinct colours (generate=blue, antagonist=red, accept=green)
- Disabled buttons: 40% opacity, cursor not-allowed
- Streaming output textarea: dark background, monospace font, auto-scroll to bottom as text arrives
- Responsive enough to be usable on a tablet (future mobile use)
- Drag-over state for context elements: dashed amber border
```

---

### BLOCK 12 — Logging & .gitignore

```
Create BookBot_08/backend/utils/logger.py

Function: log_llm_call(role: str, messages: list, response: str, model: str, project_title: str)
  - Creates a dict with: timestamp, role, model, message_count, total_input_chars, total_output_chars, messages, response
  - Writes to /logs/{YYYYMMDD_HHMMSS}_{role}.json as pretty-printed JSON
  - Also appends a one-line summary to /logs/session.log: "{timestamp} | {role} | {len(response)} chars"

---

Create BookBot_08/.gitignore with:
  .env
  .venv/
  __pycache__/
  *.pyc
  logs/
  projects/
  .idx/
```

---

### BLOCK 13 — Install & First Run Instructions

Paste this into the IDX terminal (not the Gemini panel):

```bash
cd BookBot_08
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```

Then edit `.env` and add your Tavily API key (get one free at tavily.com if you don't have it).

To start the app:
```bash
start.bat
```
Or manually:
```bash
.venv\Scripts\activate
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

Open browser to: **http://localhost:8000**

---

## TESTING THE MVP (Trump Satire Example)

Once running, follow this user journey to validate the MVP:

1. **New Project** → set title "The Gilded Fool", genre "Political Satire / Fantasy", tone "Darkly comic, morally unflinching, adult themes", audience "Adult readers", word count 50000, chapters 15
2. **Add plot points:** Fred Trump's contempt, draft dodging, contractor fraud, rise via propaganda, Roy Cohn relationship, hollow victory
3. **Context panel** — confirm all points appear with token counts, total shown
4. **Review system prompt** — edit if desired
5. **Generate Plot** → watch stream arrive in output box
6. **Run Antagonist** (1 round) → critique appears
7. **Run Plotter Revision** → improved plan appears
8. **Accept Revision** → appears in context panel as new element
9. **Save Snapshot** → confirm file appears in /projects/
10. **Load Snapshot** → confirm project reloads correctly

---

## KNOWN LIMITATIONS / NEXT STEPS

- Phase D (marketing, illustrations, EPUB) not built
- Tavily research integration not wired into Parse & Structure flow
- No per-character voice profiles (future Phase C enhancement)
- Token counter uses cl100k approximation — Qwen3/Claude counts may differ by ~5-10%
- No git repo initialised yet (all files tracked locally only)

---

*End of BookBot_08 Roadmap & Instructions*
