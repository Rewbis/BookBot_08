import os
from typing import Any, AsyncGenerator

import anthropic
from dotenv import load_dotenv

from backend.utils.logger import log_llm_call
from backend.utils.usage_tracker import tracker as usage_tracker

load_dotenv()
load_dotenv(dotenv_path=r"E:\Coding\.env", override=False)

MODEL = "claude-sonnet-5"


class ClaudeService:
    def __init__(self):
        self.client = anthropic.AsyncAnthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
        self.model = os.getenv("CLAUDE_MODEL", MODEL)

    async def generate(
        self,
        messages: list[dict],
        stream: bool = False,
        project_title: str = "unknown",
    ) -> Any:
        role = self._detect_role(messages)
        system_content = next((m["content"] for m in messages if m["role"] == "system"), "")
        user_messages = [m for m in messages if m["role"] != "system"]

        if stream:
            return self._stream(system_content, user_messages, role, project_title)
        else:
            response = await self.client.messages.create(
                model=self.model,
                max_tokens=16000,
                system=system_content,
                messages=user_messages,
            )
            text = next(b.text for b in response.content if b.type == "text")
            usage_tracker.record(
                "claude",
                response.usage.input_tokens,
                response.usage.output_tokens,
            )
            log_llm_call(role, messages, text, self.model, project_title)
            return text

    async def _stream(
        self,
        system: str,
        messages: list[dict],
        role: str,
        project_title: str,
    ) -> AsyncGenerator[str, None]:
        full_response = ""
        input_tokens = 0
        output_tokens = 0

        async with self.client.messages.stream(
            model=self.model,
            max_tokens=16000,
            system=system,
            messages=messages,
        ) as stream:
            async for text in stream.text_stream:
                full_response += text
                yield text

            final = await stream.get_final_message()
            input_tokens = final.usage.input_tokens
            output_tokens = final.usage.output_tokens

        usage_tracker.record("claude", input_tokens, output_tokens)
        log_llm_call(role, messages, full_response, self.model, project_title)

    def _detect_role(self, messages: list[dict]) -> str:
        if not messages:
            return "unknown"
        sys_msg = messages[0].get("content", "").lower()
        if "plotter" in sys_msg:
            return "plotter-revision" if "revising" in sys_msg else "plotter"
        if "antagonist" in sys_msg:
            return "antagonist"
        if "outliner" in sys_msg:
            return "outliner"
        if "precise summariser" in sys_msg or "factual summary" in sys_msg:
            return "summariser"
        if "narrative fiction writer" in sys_msg:
            return "draft"
        if "enrichment pass" in sys_msg:
            return "enrich"
        if "final polish" in sys_msg:
            return "polish"
        if "literary critic" in sys_msg:
            return "critic"
        return "unknown"
