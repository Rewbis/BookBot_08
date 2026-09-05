import os

from backend.utils.usage_tracker import CLAUDE_INPUT_COST, CLAUDE_OUTPUT_COST

# Defaults reflect claude-sonnet-5 (1M context). The warn threshold is deliberately
# an absolute token count, not a fraction of the window: long-context studies show
# quality falls gradually from the first tokens, with no cliff near the limit, and
# cost is the sharper constraint. Override per deployment via .env.
DEFAULT_CONTEXT_WINDOW = 1_000_000
DEFAULT_CONTEXT_WARN_TOKENS = 120_000


def get_model_config() -> dict:
    return {
        "model_name": os.getenv("CLAUDE_MODEL", "claude-sonnet-5"),
        "context_window": int(os.getenv("CLAUDE_CONTEXT_WINDOW", DEFAULT_CONTEXT_WINDOW)),
        "context_warn_tokens": int(os.getenv("CONTEXT_WARN_TOKENS", DEFAULT_CONTEXT_WARN_TOKENS)),
        "input_cost_per_mtok": round(CLAUDE_INPUT_COST * 1_000_000, 4),
        "output_cost_per_mtok": round(CLAUDE_OUTPUT_COST * 1_000_000, 4),
    }
