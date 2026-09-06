import json
import re
from datetime import datetime

from backend.models.schemas import BookProject, Chapter, ContextElement, PlantedClue, VoiceProfile, VoiceStage
from backend.utils.snapshot import load_snapshot, save_snapshot, suggest_filename


def make_project(title="My Book") -> BookProject:
    now = datetime.now().isoformat()
    return BookProject(
        id="p1",
        title=title,
        target_word_count=1000,
        target_chapter_count=2,
        phase="A",
        context_elements=[],
        chapters=[],
        model_name="test-model",
        created_at=now,
        updated_at=now,
    )


def test_suggest_filename_sanitises_title():
    fn = suggest_filename(make_project("The Harbour Ledger: Part 2!"))
    assert fn.startswith("bookbot_the_harbour_ledger_part_2_")
    assert re.fullmatch(r"bookbot_[a-z0-9_]+_\d{8}_\d{4}\.json", fn)


def test_suggest_filename_empty_title_falls_back_to_untitled():
    assert suggest_filename(make_project("!!!")).startswith("bookbot_untitled_")


def test_planted_clue_default_status_is_active():
    assert PlantedClue(id="x", label="l", description="d").status == "active"


def test_save_load_round_trip_preserves_phase_a_state(tmp_path):
    p = make_project()
    p.planted_clues = [PlantedClue(id="c1", label="Key", description="a brass key")]
    p.plotter_output = "plot"
    p.antagonist_output = "critique"
    p.plotter_revision_output = "revised"
    p.continuity_output = '{"verdict": "approve"}'
    p.premise_summary = "short"
    p.style_sample = "The rain came sideways."
    p.style_guide = "Short sentences. Weather as mood."
    p.voice_profiles = [VoiceProfile(id="v1", name="Mara", stages=[
        VoiceStage(label="youth", from_chapter=1, to_chapter=5, voice="Quick, cocky."),
        VoiceStage(label="adult", from_chapter=6, to_chapter=0, voice="Measured, tired."),
    ])]
    p.context_elements = [
        ContextElement(
            id="e1", label="Premise", content="Once upon a time", element_type="premise",
            phase="A", order=0, source="human", created_at=p.created_at, updated_at=p.updated_at,
        ),
        ContextElement(
            id="e2", label="Ch 1 Skeleton: Arrival", content="short summary", element_type="chapter_skeleton",
            phase="B", order=1, source="llm", created_at=p.created_at, updated_at=p.updated_at,
            compressed=True, content_full="the long skeleton text", source_ref="chapter-1-id",
        ),
    ]

    path = tmp_path / "snap.json"
    save_snapshot(p, str(path))
    loaded = load_snapshot(str(path))

    assert loaded.title == p.title
    assert loaded.planted_clues[0].label == "Key"
    assert loaded.planted_clues[0].status == "active"
    assert loaded.plotter_output == "plot"
    assert loaded.antagonist_output == "critique"
    assert loaded.plotter_revision_output == "revised"
    assert loaded.continuity_output == '{"verdict": "approve"}'
    assert loaded.premise_summary == "short"
    assert loaded.style_sample == "The rain came sideways."
    assert loaded.style_guide == "Short sentences. Weather as mood."
    assert loaded.voice_profiles[0].name == "Mara"
    assert [s.label for s in loaded.voice_profiles[0].stages] == ["youth", "adult"]
    assert loaded.voice_profiles[0].stages[1].to_chapter == 0
    assert loaded.context_elements[0].label == "Premise"
    assert loaded.context_elements[0].compressed is False
    assert loaded.context_elements[0].content_full == ""
    e2 = loaded.context_elements[1]
    assert e2.compressed is True
    assert e2.content_full == "the long skeleton text"
    assert e2.source_ref == "chapter-1-id"


def test_chapter_continuity_fields_round_trip(tmp_path):
    p = make_project()
    p.chapters = [Chapter(
        id="c1", number=1, title="Arrival", intention="", scene_notes="", skeleton="", summary="",
        full_text="prose", order=1, status="drafted",
        story_state={"chapter": 1, "characters": {"Mara": {"location": "docks", "knows": ["the seal is forged"]}},
                     "open_threads": ["who sent the letter?"]},
        continuity_report='{"verdict": "approve", "issues": []}',
        continuity_verdict="approve",
        state_stale=True,
        state_computed_at="2026-09-05T20:00:00",
    )]
    path = tmp_path / "c.json"
    save_snapshot(p, str(path))
    ch = load_snapshot(str(path)).chapters[0]
    assert ch.story_state["characters"]["Mara"]["knows"] == ["the seal is forged"]
    assert ch.continuity_verdict == "approve"
    assert ch.state_stale is True
    assert json.loads(ch.continuity_report)["verdict"] == "approve"


def test_legacy_chapter_without_continuity_fields_loads():
    ch = Chapter(id="c", number=1, title="t", intention="", scene_notes="", skeleton="", summary="",
                 full_text="", order=1, status="empty")
    assert ch.story_state == {}
    assert ch.continuity_verdict == ""
    assert ch.state_stale is False


def test_save_stamps_updated_at_as_iso(tmp_path):
    p = make_project()
    save_snapshot(p, str(tmp_path / "s.json"))
    datetime.fromisoformat(p.updated_at)  # raises if not ISO


def test_legacy_snapshot_without_new_fields_still_loads(tmp_path):
    # Snapshots written before the Phase A loop fields / planted_clues existed.
    data = {
        "id": "p", "title": "Old", "target_word_count": 1, "target_chapter_count": 1,
        "phase": "A", "context_elements": [], "chapters": [], "model_name": "m",
        "created_at": "2026-01-01T00:00:00", "updated_at": "2026-01-01T00:00:00",
        "genre": "noir", "tone": "dark", "audience": "adult",
    }
    path = tmp_path / "old.json"
    path.write_text(json.dumps(data), encoding="utf-8")

    loaded = load_snapshot(str(path))
    assert loaded.plotter_output == ""
    assert loaded.planted_clues == []
    assert loaded.genre == "noir"
