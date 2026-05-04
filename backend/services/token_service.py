import tiktoken

class TokenService:
    def __init__(self):
        # This is an approximation for Qwen3; exact counts may vary slightly
        self.encoder = tiktoken.get_encoding("cl100k_base")

    def count_tokens(self, text: str) -> int:
        return len(self.encoder.encode(text))

    def count_elements(self, elements: list[dict]) -> list[dict]:
        for el in elements:
            el["token_count"] = self.count_tokens(el.get("content", ""))
        return elements

    def total_tokens(self, elements: list[dict]) -> int:
        return sum(el.get("token_count", 0) for el in elements if el.get("enabled", True))
