"""
Runtime switch between the commercial model (Claude via API) and the local model
(Ollama). Every agent endpoint calls `provider.generate(...)`; the header toggle
in the UI changes `provider.current` for the running server.

Services are created lazily so this module can be imported (and unit-tested)
without an Anthropic API key or a running Ollama.
"""
import os

PROVIDERS = ("claude", "ollama")


class LLMProvider:
    def __init__(self, default: str | None = None):
        self._claude = None
        self._ollama = None
        wanted = default if default is not None else os.getenv("LLM_PROVIDER", "claude")
        self.current = wanted if wanted in PROVIDERS else "claude"

    # ── lazy services ────────────────────────────────────────────────────────
    @property
    def claude(self):
        if self._claude is None:
            from backend.services.claude_service import ClaudeService
            self._claude = ClaudeService()
        return self._claude

    @property
    def ollama(self):
        if self._ollama is None:
            from backend.services.ollama_service import OllamaService
            self._ollama = OllamaService()
        return self._ollama

    @property
    def service(self):
        return self.claude if self.current == "claude" else self.ollama

    # ── control ──────────────────────────────────────────────────────────────
    def set(self, name: str) -> str:
        if name not in PROVIDERS:
            raise ValueError(f"unknown provider {name!r}; expected one of {PROVIDERS}")
        self.current = name
        return self.current

    @property
    def model_name(self) -> str:
        return self.service.model

    def claude_configured(self) -> bool:
        return bool(os.getenv("ANTHROPIC_API_KEY"))

    # ── generation ───────────────────────────────────────────────────────────
    async def generate(self, messages: list[dict], stream: bool = False, project_title: str = "unknown"):
        return await self.service.generate(messages, stream=stream, project_title=project_title)


# Singleton shared by the routers
provider = LLMProvider()
