from backend.services.ollama_service import strip_thinking


def test_strips_think_block_and_leading_whitespace():
    assert strip_thinking("<think>reasoning\nmore</think>\n\nReal answer") == "Real answer"


def test_passthrough_when_no_think_tag():
    assert strip_thinking("  Plain output  ") == "Plain output"


def test_only_first_close_tag_is_used():
    # A stray </think> inside the real output must not truncate it.
    assert strip_thinking("<think>a</think>b</think>c") == "b</think>c"
