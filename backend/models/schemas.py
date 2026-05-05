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
    actions_draft: str = ""
    sensory_draft: str = ""
    dialogue_draft: str = ""
    style_draft: str = ""
    critic_output: str = ""
    polish_draft: str = ""
    phase_c_status: str = "not_started"

    model_config = ConfigDict(populate_by_name=True)

class BookProject(BaseModel):
    id: str
    title: str
    genre: str
    tone: str
    audience: str
    target_word_count: int
    target_chapter_count: int
    phase: str
    context_elements: List[ContextElement]
    chapters: List[Chapter]
    world_dict: Dict[str, Any]
    antagonist_rounds: int = 1
    model_name: str
    created_at: str
    updated_at: str
    snapshot_notes: str

    model_config = ConfigDict(populate_by_name=True)
