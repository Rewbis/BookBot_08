import asyncio

import pytest

from backend.services.llm_provider import PROVIDERS, LLMProvider


class FakeService:
    def __init__(self, model):
        self.model = model
        self.calls = []

    async def generate(self, messages, stream=False, project_title="unknown"):
        self.calls.append((messages, stream, project_title))
        return f"{self.model}:ok"


def make(default="claude", settings_path=None):
    p = LLMProvider(default=default, settings_path=settings_path)
    p._claude = FakeService("claude-sonnet-5")
    p._ollama = FakeService("qwen3-local")
    return p


def test_default_is_claude_and_env_is_respected(monkeypatch):
    monkeypatch.delenv("LLM_PROVIDER", raising=False)
    assert LLMProvider(settings_path=None).current == "claude"
    monkeypatch.setenv("LLM_PROVIDER", "ollama")
    assert LLMProvider(settings_path=None).current == "ollama"
    monkeypatch.setenv("LLM_PROVIDER", "nonsense")
    assert LLMProvider(settings_path=None).current == "claude"


def test_choice_persists_across_restart(tmp_path, monkeypatch):
    monkeypatch.delenv("LLM_PROVIDER", raising=False)
    path = str(tmp_path / "settings.json")
    p = make(settings_path=path)
    p.set("ollama")
    assert (tmp_path / "settings.json").is_file()
    # "restart": a fresh instance reads the file, and the file beats the env default
    monkeypatch.setenv("LLM_PROVIDER", "claude")
    assert LLMProvider(settings_path=path).current == "ollama"
    # other keys in the file survive a save
    (tmp_path / "settings.json").write_text('{"provider": "ollama", "other": 1}', encoding="utf-8")
    p2 = make(settings_path=path)
    p2.set("claude")
    import json
    assert json.loads((tmp_path / "settings.json").read_text(encoding="utf-8")) == {"provider": "claude", "other": 1}


def test_corrupt_settings_file_is_ignored(tmp_path):
    path = tmp_path / "settings.json"
    path.write_text("{not json", encoding="utf-8")
    assert LLMProvider(default="claude", settings_path=str(path)).current == "claude"


def test_set_validates():
    p = make()
    assert p.set("ollama") == "ollama"
    assert p.current == "ollama"
    with pytest.raises(ValueError):
        p.set("gemini")
    assert p.current == "ollama"          # unchanged after a bad set
    assert set(PROVIDERS) == {"claude", "ollama"}


def test_generate_routes_to_active_service():
    p = make()
    msgs = [{"role": "user", "content": "hi"}]
    assert asyncio.run(p.generate(msgs, project_title="T")) == "claude-sonnet-5:ok"
    p.set("ollama")
    assert asyncio.run(p.generate(msgs, project_title="T")) == "qwen3-local:ok"
    assert p._claude.calls == [(msgs, False, "T")]
    assert p._ollama.calls == [(msgs, False, "T")]


def test_model_name_follows_provider():
    p = make()
    assert p.model_name == "claude-sonnet-5"
    p.set("ollama")
    assert p.model_name == "qwen3-local"


def test_services_are_lazy():
    # No API key, no Ollama: constructing the provider must not touch either service.
    p = LLMProvider(default="claude")
    assert p._claude is None and p._ollama is None


def test_claude_configured(monkeypatch):
    p = make()
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    assert p.claude_configured() is False
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-x")
    assert p.claude_configured() is True
