from pydantic import BaseModel, ConfigDict
from typing import List, Dict, Any

class ContextElement(BaseModel):
    id: str
    label: str
    content: str
    element_type: str
    phase: str
    order: int
    enabled: bool = True
    token_count: int = 0
    source: str
    created_at: str
    updated_at: str
    # Context budget: an element can be swapped for a compressed alternative
    # (e.g. chapter skeleton -> chapter summary). content_full keeps the original
    # so the swap is lossless; source_ref links back to the originating record
    # (e.g. a chapter id) so the alternative can be looked up.
    compressed: bool = False
    content_full: str = ""
    source_ref: str = ""

    model_config = ConfigDict(populate_by_name=True)

class Chapter(BaseModel):
    id: str
    number: int
    title: str
    intention: str
    scene_notes: str
    skeleton: str
    summary: str
    full_text: str
    order: int
    status: str
    approved: bool = False
    draft_text: str = ""
    enrich_draft: str = ""
    enrich_draft_summary: str = ""
    critic_output: str = ""
    explicit_review_notes: str = ""
    has_explicit_content: bool = False
    polish_draft: str = ""
    phase_c_status: str = "not_started"
    # Per-chapter continuity. story_state = the world as it stands at the END of this
    # chapter (characters' location/knowledge/wants/condition/possessions/relationships,
    # open threads, clue lifecycle, world facts). Chapter N's drafter and critic read
    # chapter N-1's state as canon. Rewriting chapter N regenerates only state N and
    # flags every later chapter stale; the human decides what to re-run.
    story_state: Dict[str, Any] = {}
    continuity_report: str = ""      # JSON string of the last /chapter-continuity response
    continuity_verdict: str = ""     # approve | revise | ""
    state_stale: bool = False
    state_computed_at: str = ""
    # Phase D: image-generation prompt for a key scene near the chapter opening
    illustration_prompt: str = ""

    model_config = ConfigDict(populate_by_name=True)

class PlantedClue(BaseModel):
    id: str
    label: str
    description: str
    planted_in: str = ""
    pays_off_in: str = ""
    status: str = "active"   # active | blocked

    model_config = ConfigDict(populate_by_name=True)

class VoiceStage(BaseModel):
    """How a character speaks/thinks during a span of chapters (child, youth, adult, elderly, all...)."""
    label: str = "all"
    from_chapter: int = 1
    to_chapter: int = 0        # 0 = open-ended (to the last chapter)
    voice: str = ""

    model_config = ConfigDict(populate_by_name=True)

class VoiceProfile(BaseModel):
    id: str
    name: str
    stages: List[VoiceStage] = []

    model_config = ConfigDict(populate_by_name=True)

class BookProject(BaseModel):
    id: str
    title: str
    target_word_count: int
    target_chapter_count: int
    phase: str
    context_elements: List[ContextElement]
    chapters: List[Chapter]
    world_dict: Dict[str, Any] = {}
    # Creative dump and structured slots (replaces genre/tone/audience/system prompt)
    creative_dump: str = ""
    role_constraints: str = ""
    premise: str = ""
    premise_summary: str = ""
    characters: str = ""
    world_notes: str = ""
    # Writing style: raw author sample + derived guide (both optionally promoted to context)
    style_sample: str = ""
    style_guide: str = ""
    # Per-character voice profiles, optionally staged by chapter range; Phase C injects
    # only the stage active for the chapter being written.
    voice_profiles: List[VoiceProfile] = []
    planted_clues: List[PlantedClue] = []
    # Phase D: publishing metadata
    author: str = ""
    tagline: str = ""
    blurb: str = ""
    cover_prompt: str = ""
    # Phase A loop outputs — persisted so snapshots survive a reload mid-loop
    plotter_output: str = ""
    antagonist_output: str = ""
    plotter_revision_output: str = ""
    continuity_output: str = ""
    # Legacy fields — kept for old snapshot compatibility
    genre: str = ""
    tone: str = ""
    audience: str = ""
    model_name: str
    created_at: str
    updated_at: str
    snapshot_notes: str = ""

    model_config = ConfigDict(populate_by_name=True)
