"""
Character voice profiles: pick the stage active for a chapter and render it for prompts.

A profile is {name, stages: [{label, from_chapter, to_chapter, voice}]}. Stages carry
explicit chapter ranges (to_chapter 0 = open-ended). Selection rules, in order:
  1. the first stage whose range contains the chapter;
  2. otherwise the latest stage that starts at or before the chapter (a gap between
     ranges inherits the preceding stage);
  3. otherwise the first stage (chapter is before every range).
Stages with an empty voice are skipped.
"""


def _int(v, default):
    try:
        return int(v)
    except (TypeError, ValueError):
        return default


def stage_for_chapter(stages: list[dict], chapter_number: int) -> dict | None:
    stages = [s for s in (stages or []) if isinstance(s, dict)]
    if not stages:
        return None
    for s in stages:
        start = _int(s.get("from_chapter"), 1)
        end = _int(s.get("to_chapter"), 0)
        if chapter_number >= start and (end == 0 or chapter_number <= end):
            return s
    before = [s for s in stages if _int(s.get("from_chapter"), 1) <= chapter_number]
    if before:
        return max(before, key=lambda s: _int(s.get("from_chapter"), 1))
    return stages[0]


def voices_for_chapter(profiles: list[dict], chapter_number: int) -> list[dict]:
    """Return [{name, stage_label, voice}] for every profile with a usable stage."""
    out = []
    for p in profiles or []:
        if not isinstance(p, dict):
            continue
        stage = stage_for_chapter(p.get("stages") or [], chapter_number)
        if not stage:
            continue
        voice = (stage.get("voice") or "").strip()
        if not voice:
            continue
        out.append({
            "name": (p.get("name") or "").strip() or "Unnamed",
            "stage_label": (stage.get("label") or "").strip(),
            "voice": voice,
        })
    return out


def build_voices_block(voices: list[dict]) -> str:
    if not voices:
        return ""
    lines = ["## Character Voices (this chapter)"]
    for v in voices:
        label = v.get("stage_label") or ""
        suffix = f" ({label})" if label and label != "all" else ""
        lines.append(f"### {v['name']}{suffix}\n{v['voice']}")
    return "\n".join(lines) + "\n\n"
