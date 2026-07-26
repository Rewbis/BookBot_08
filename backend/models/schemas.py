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

    model_config = ConfigDict(populate_by_name=True)

class PlantedClue(BaseModel):
    id: str
    label: str
    description: str
    planted_in: str = ""
    pays_off_in: str = ""
    status: str = "active"   # active | blocked

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
    planted_clues: List[PlantedClue] = []
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
