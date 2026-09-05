from backend.utils.model_config import (
    DEFAULT_CONTEXT_WARN_TOKENS,
    DEFAULT_CONTEXT_WINDOW,
    get_model_config,
)


def test_defaults(monkeypatch):
    for var in ("CLAUDE_MODEL", "CLAUDE_CONTEXT_WINDOW", "CONTEXT_WARN_TOKENS"):
        monkeypatch.delenv(var, raising=False)
    cfg = get_model_config()
    assert cfg["model_name"] == "claude-sonnet-5"
    assert cfg["context_window"] == DEFAULT_CONTEXT_WINDOW == 1_000_000
    assert cfg["context_warn_tokens"] == DEFAULT_CONTEXT_WARN_TOKENS == 120_000
    assert cfg["input_cost_per_mtok"] == 2.0
    assert cfg["output_cost_per_mtok"] == 10.0


def test_env_overrides(monkeypatch):
    monkeypatch.setenv("CLAUDE_MODEL", "claude-opus-5")
    monkeypatch.setenv("CLAUDE_CONTEXT_WINDOW", "200000")
    monkeypatch.setenv("CONTEXT_WARN_TOKENS", "60000")
    cfg = get_model_config()
    assert cfg["model_name"] == "claude-opus-5"
    assert cfg["context_window"] == 200_000
    assert cfg["context_warn_tokens"] == 60_000


def test_warn_threshold_is_below_window():
    cfg = get_model_config()
    assert cfg["context_warn_tokens"] < cfg["context_window"]
