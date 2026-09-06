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


def make(default="claude"):
    p = LLMProvider(default=default)
    p._claude = FakeService("claude-sonnet-5")
    p._ollama = FakeService("qwen3-local")
    return p


def test_default_is_claude_and_env_is_respected(monkeypatch):
    monkeypatch.delenv("LLM_PROVIDER", raising=False)
    assert LLMProvider().current == "claude"
    monkeypatch.setenv("LLM_PROVIDER", "ollama")
    assert LLMProvider().current == "ollama"
    monkeypatch.setenv("LLM_PROVIDER", "nonsense")
    assert LLMProvider().current == "claude"


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
