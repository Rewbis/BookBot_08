from backend.services.token_service import TokenService


def test_count_tokens_positive_for_text():
    assert TokenService().count_tokens("Hello world, this is a sentence.") > 0


def test_count_tokens_zero_for_empty():
    assert TokenService().count_tokens("") == 0


def test_count_elements_populates_token_count():
    out = TokenService().count_elements([{"content": "some words here"}, {"content": ""}])
    assert out[0]["token_count"] > 0
    assert out[1]["token_count"] == 0


def test_total_tokens_skips_disabled_and_defaults_enabled_true():
    els = [
        {"token_count": 5, "enabled": True},
        {"token_count": 7, "enabled": False},
        {"token_count": 3},  # no enabled key → treated as enabled
    ]
    assert TokenService().total_tokens(els) == 8
