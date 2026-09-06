from backend.utils.voices import build_voices_block, stage_for_chapter, voices_for_chapter


def staged_profile():
    return {
        "id": "p1",
        "name": "Ada",
        "stages": [
            {"label": "child",   "from_chapter": 1,  "to_chapter": 3,  "voice": "Short sentences, wants approval."},
            {"label": "youth",   "from_chapter": 4,  "to_chapter": 8,  "voice": "Brash, tests limits."},
            {"label": "adult",   "from_chapter": 9,  "to_chapter": 15, "voice": "Salesman cadence, superlatives."},
            {"label": "elderly", "from_chapter": 16, "to_chapter": 0,  "voice": "Repeats himself, grievance."},
        ],
    }


def test_stage_in_range():
    assert stage_for_chapter(staged_profile()["stages"], 5)["label"] == "youth"


def test_open_ended_last_stage():
    assert stage_for_chapter(staged_profile()["stages"], 40)["label"] == "elderly"


def test_gap_inherits_preceding_stage():
    stages = [
        {"label": "a", "from_chapter": 1, "to_chapter": 2, "voice": "x"},
        {"label": "b", "from_chapter": 6, "to_chapter": 0, "voice": "y"},
    ]
    assert stage_for_chapter(stages, 4)["label"] == "a"


def test_chapter_before_every_range_uses_first_stage():
    stages = [{"label": "b", "from_chapter": 5, "to_chapter": 0, "voice": "y"}]
    assert stage_for_chapter(stages, 1)["label"] == "b"


def test_empty_stages_returns_none():
    assert stage_for_chapter([], 3) is None


def test_voices_for_chapter_skips_empty_voice_and_defaults_name():
    profiles = [
        staged_profile(),
        {"id": "p2", "name": "", "stages": [{"label": "all", "from_chapter": 1, "to_chapter": 0, "voice": "Dry."}]},
        {"id": "p3", "name": "Silent", "stages": [{"label": "all", "from_chapter": 1, "to_chapter": 0, "voice": "   "}]},
    ]
    out = voices_for_chapter(profiles, 10)
    assert [v["name"] for v in out] == ["Ada", "Unnamed"]
    assert out[0]["stage_label"] == "adult"
    assert out[0]["voice"].startswith("Salesman")


def test_tolerates_string_numbers_and_garbage():
    stages = [{"label": "x", "from_chapter": "2", "to_chapter": "", "voice": "v"}]
    assert stage_for_chapter(stages, 3)["label"] == "x"
    assert voices_for_chapter([None, "junk", {"stages": None}], 1) == []


def test_build_voices_block_format():
    block = build_voices_block([
        {"name": "Ada", "stage_label": "adult", "voice": "Superlatives."},
        {"name": "Ben", "stage_label": "all", "voice": "Clipped."},
    ])
    assert block.startswith("## Character Voices (this chapter)\n")
    assert "### Ada (adult)\nSuperlatives." in block
    assert "### Ben\nClipped." in block          # 'all' stage gets no suffix
    assert block.endswith("\n\n")
    assert build_voices_block([]) == ""
