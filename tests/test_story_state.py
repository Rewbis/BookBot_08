import json

from backend.utils.story_state import build_state_block, empty_state, has_content, normalise_story_state


def test_empty_state_shape():
    s = empty_state(4)
    assert s == {"chapter": 4, "timeline": "", "characters": {}, "open_threads": [], "clues": {}, "world_facts": []}


def test_normalise_fills_missing_and_fixes_wrong_types():
    raw = {"characters": "not a dict", "open_threads": ["a"], "clues": None}
    s = normalise_story_state(raw, chapter_number=2)
    assert s["chapter"] == 2
    assert s["characters"] == {}          # wrong type -> default
    assert s["open_threads"] == ["a"]     # right type -> kept
    assert s["clues"] == {}
    assert s["world_facts"] == []
    assert s["timeline"] == ""


def test_normalise_preserves_extra_keys():
    s = normalise_story_state({"characters": {"Keel": {"location": "docks"}}, "weather": "rain"}, 1)
    assert s["characters"]["Keel"]["location"] == "docks"
    assert s["weather"] == "rain"


def test_normalise_non_dict_returns_empty():
    assert normalise_story_state("garbage", 7) == empty_state(7)
    assert normalise_story_state(None) == empty_state(0)


def test_chapter_number_from_state_when_not_given():
    assert normalise_story_state({"chapter": 9})["chapter"] == 9
    assert normalise_story_state({"chapter": "nine"})["chapter"] == 0


def test_has_content():
    assert not has_content(empty_state(1))
    assert not has_content({})
    assert not has_content("x")
    assert has_content({"open_threads": ["who sent the letter?"]})


def test_build_state_block_empty_and_nonempty():
    assert build_state_block(empty_state(1)) == ""
    state = {"chapter": 2, "characters": {"Keel": {"knows": ["the seal is forged"]}}}
    block = build_state_block(state)
    assert block.startswith("## Story State Before This Chapter\n```json\n")
    assert block.endswith("```\n\n")
    inner = block.split("```json\n", 1)[1].rsplit("```", 1)[0]
    assert json.loads(inner)["characters"]["Keel"]["knows"] == ["the seal is forged"]
    assert build_state_block(state, heading="Custom").startswith("## Custom\n")
