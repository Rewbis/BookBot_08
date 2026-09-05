import json

import pytest

from backend.utils.llm_json import parse_json_response


def test_plain_json():
    assert parse_json_response('{"a": 1}') == {"a": 1}


def test_json_fence_with_language_tag():
    assert parse_json_response('```json\n{"a": 1}\n```') == {"a": 1}


def test_bare_fence():
    assert parse_json_response('```\n{"a": 1}\n```') == {"a": 1}


def test_surrounding_whitespace():
    assert parse_json_response('  \n{"a": 1}\n\n  ') == {"a": 1}


def test_nested_structure_survives():
    raw = '```json\n{"verdict": "approve", "issues": [], "clue_updates": [{"id": "c1", "status": "active"}]}\n```'
    out = parse_json_response(raw)
    assert out["verdict"] == "approve"
    assert out["clue_updates"][0]["status"] == "active"


def test_invalid_raises():
    with pytest.raises(json.JSONDecodeError):
        parse_json_response("Sure! Here is your plan: ...")
