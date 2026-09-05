"""
Per-chapter story state: the canonical world as it stands at the end of a chapter.

Shape (all keys always present after normalise_story_state):
{
  "chapter": 3,
  "timeline": "Dusk, day 4 of the investigation",
  "characters": {
    "Keel": {"location": "...", "knows": ["..."], "wants": "...", "condition": "...",
             "possessions": ["..."], "relationships": {"Damsel": "..."}}
  },
  "open_threads": ["..."],
  "clues": {"clue_1": {"status": "unplanted|planted|paid_off|blocked", "note": "..."}},
  "world_facts": ["..."]
}
Unknown extra keys the agent adds are preserved.
"""
import json

_TYPED_KEYS = {
    "timeline": str,
    "characters": dict,
    "open_threads": list,
    "clues": dict,
    "world_facts": list,
}


def empty_state(chapter_number: int = 0) -> dict:
    return {
        "chapter": chapter_number,
        "timeline": "",
        "characters": {},
        "open_threads": [],
        "clues": {},
        "world_facts": [],
    }


def normalise_story_state(state, chapter_number: int | None = None) -> dict:
    """Coerce whatever the model returned into the canonical shape without losing extras."""
    base = empty_state(chapter_number or 0)
    if not isinstance(state, dict):
        return base
    out = dict(base)
    for key, typ in _TYPED_KEYS.items():
        value = state.get(key)
        if isinstance(value, typ):
            out[key] = value
    if chapter_number is not None:
        out["chapter"] = chapter_number
    elif isinstance(state.get("chapter"), int):
        out["chapter"] = state["chapter"]
    for key, value in state.items():
        if key not in out:
            out[key] = value
    return out


def has_content(state) -> bool:
    if not isinstance(state, dict):
        return False
    return any(state.get(k) for k in ("timeline", "characters", "open_threads", "clues", "world_facts"))


def build_state_block(state, heading: str = "Story State Before This Chapter") -> str:
    """Render a state dict as a prompt section; empty string if there is nothing to say."""
    if not has_content(state):
        return ""
    return f"## {heading}\n```json\n{json.dumps(state, indent=1, ensure_ascii=False)}\n```\n\n"
