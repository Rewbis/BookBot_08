"""
Runtime switch between the commercial model (Claude via API) and the local model
(Ollama). Every agent endpoint calls `provider.generate(...)`; the header toggle
in the UI changes `provider.current` for the running server.

The choice is persisted to a small settings file so it survives a server restart.
Precedence at startup: settings file > LLM_PROVIDER env > "claude".

Services are created lazily so this module can be imported (and unit-tested)
without an Anthropic API key or a running Ollama.
"""
import json
import os

PROVIDERS = ("claude", "ollama")
DEFAULT_SETTINGS_PATH = os.getenv("BOOKBOT_SETTINGS", ".bookbot_settings.json")


class LLMProvider:
    def __init__(self, default: str | None = None, settings_path: str | None = DEFAULT_SETTINGS_PATH):
        self._claude = None
        self._ollama = None
        self.settings_path = settings_path
        wanted = default if default is not None else os.getenv("LLM_PROVIDER", "claude")
        saved = self._load_saved()
        if saved in PROVIDERS:
            wanted = saved
        self.current = wanted if wanted in PROVIDERS else "claude"

    # ── persistence ──────────────────────────────────────────────────────────
    def _load_saved(self) -> str | None:
        if not self.settings_path or not os.path.isfile(self.settings_path):
            return None
        try:
            with open(self.settings_path, encoding="utf-8") as f:
                return json.load(f).get("provider")
        except (OSError, ValueError):
            return None

    def _save(self) -> None:
        if not self.settings_path:
            return
        data = {}
        if os.path.isfile(self.settings_path):
            try:
                with open(self.settings_path, encoding="utf-8") as f:
                    data = json.load(f) or {}
            except (OSError, ValueError):
                data = {}
        data["provider"] = self.current
        try:
            with open(self.settings_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
        except OSError:
            pass   # a read-only working dir must not break generation

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
        self._save()
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
