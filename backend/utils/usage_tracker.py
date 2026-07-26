from dataclasses import dataclass, field

# Claude Sonnet 5 pricing (USD per token)
CLAUDE_INPUT_COST  = 2.00 / 1_000_000
CLAUDE_OUTPUT_COST = 10.00 / 1_000_000


@dataclass
class ModelUsage:
    input_tokens: int = 0
    output_tokens: int = 0

    def cost(self, input_rate: float, output_rate: float) -> float:
        return self.input_tokens * input_rate + self.output_tokens * output_rate


class UsageTracker:
    def __init__(self):
        self.claude = ModelUsage()
        self.local = ModelUsage()

    def record(self, model: str, input_tokens: int, output_tokens: int):
        if model == "claude":
            self.claude.input_tokens += input_tokens
            self.claude.output_tokens += output_tokens
        else:
            self.local.input_tokens += input_tokens
            self.local.output_tokens += output_tokens

    def summary(self) -> dict:
        claude_cost = self.claude.cost(CLAUDE_INPUT_COST, CLAUDE_OUTPUT_COST)
        return {
            "claude": {
                "input_tokens": self.claude.input_tokens,
                "output_tokens": self.claude.output_tokens,
                "cost_usd": round(claude_cost, 6),
            },
            "local": {
                "input_tokens": self.local.input_tokens,
                "output_tokens": self.local.output_tokens,
                "cost_usd": 0.0,
            },
            "total_cost_usd": round(claude_cost, 6),
        }

    def reset(self):
        self.claude = ModelUsage()
        self.local = ModelUsage()


# Singleton shared across the app
tracker = UsageTracker()
