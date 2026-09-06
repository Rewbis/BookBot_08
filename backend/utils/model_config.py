import os

from backend.utils.usage_tracker import CLAUDE_INPUT_COST, CLAUDE_OUTPUT_COST

# Defaults reflect claude-sonnet-5 (1M context). The warn threshold is deliberately
# an absolute token count, not a fraction of the window: long-context studies show
# quality falls gradually from the first tokens, with no cliff near the limit, and
# cost is the sharper constraint. Override per deployment via .env.
DEFAULT_CONTEXT_WINDOW = 1_000_000
DEFAULT_CONTEXT_WARN_TOKENS = 120_000

# For a local model the window IS a hard limit, so warn well inside it to leave
# room for the reply.
LOCAL_WARN_FRACTION = 0.75


def get_model_config(provider: str = "claude", ollama_model: str | None = None,
                     ollama_num_ctx: int | None = None) -> dict:
    if provider == "ollama":
        num_ctx = int(ollama_num_ctx or os.getenv("OLLAMA_NUM_CTX", "16384"))
        return {
            "provider": "ollama",
            "model_name": ollama_model or os.getenv("OLLAMA_MODEL", ""),
            "context_window": num_ctx,
            "context_warn_tokens": int(num_ctx * LOCAL_WARN_FRACTION),
            "input_cost_per_mtok": 0.0,
            "output_cost_per_mtok": 0.0,
        }
    return {
        "provider": "claude",
        "model_name": os.getenv("CLAUDE_MODEL", "claude-sonnet-5"),
        "context_window": int(os.getenv("CLAUDE_CONTEXT_WINDOW", DEFAULT_CONTEXT_WINDOW)),
        "context_warn_tokens": int(os.getenv("CONTEXT_WARN_TOKENS", DEFAULT_CONTEXT_WARN_TOKENS)),
        "input_cost_per_mtok": round(CLAUDE_INPUT_COST * 1_000_000, 4),
        "output_cost_per_mtok": round(CLAUDE_OUTPUT_COST * 1_000_000, 4),
    }
