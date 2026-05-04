import os
import json
import httpx

import re

from typing import AsyncGenerator, Any
from backend.utils.logger import log_llm_call

from dotenv import load_dotenv
load_dotenv()


def strip_thinking(text: str) -> str:
    if '</think>' in text:
        text = text.split('</think>', 1)[1]
    return text.strip()

class OllamaService:
    def __init__(self):
        self.base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
        self.model = os.getenv("OLLAMA_MODEL", "richardyoung/qwen3-14b-abliterated:Q5_K_M")
        self.num_ctx = int(os.getenv("OLLAMA_NUM_CTX", "16384"))

    async def generate(self, messages: list[dict], stream: bool = True) -> Any:
        # messages = [
        #   {"role": "system", "content": "You are a creative writing assistant..."},
        #   {"role": "user", "content": "Write a chapter outline for..."}
        # ]
        url = f"{self.base_url}/api/generate"
        system_content = next((m["content"] for m in messages if m["role"] == "system"), "")
        user_content = next((m["content"] for m in messages if m["role"] == "user"), "")
        payload = {
            "model": self.model,
            "prompt": f"{system_content}\n\n{user_content}",
            "stream": stream,
            "options": {
                "num_ctx": self.num_ctx
            }
        }

        role = "unknown"
        if messages and len(messages) > 0:
            sys_msg = messages[0].get("content", "")
            if "plotter" in sys_msg.lower():
                role = "plotter"
            elif "antagonist" in sys_msg.lower():
                role = "antagonist"
            elif "revising" in sys_msg.lower():
                role = "plotter-revision"
            elif "outliner" in sys_msg.lower():
                role = "outliner"
            elif "factual summary" in sys_msg.lower():
                role = "summariser"
        
        async with httpx.AsyncClient(timeout=300.0) as client:
            if stream:
                async def stream_generator():
                    full_response = ""
                    async with client.stream("POST", url, json=payload) as response:
                        response.raise_for_status()
                        async for chunk in response.aiter_lines():
                            if chunk:
                                data = json.loads(chunk)
                                if "response" in data:
                                    content = data["response"]
                                    full_response += content
                                    yield content
                    log_llm_call(role, messages, full_response, self.model)
                return stream_generator()
            else:
                response = await client.post(url, json=payload)
                response.raise_for_status()
                data = response.json()
                full_response = data.get("response", "")
                cleaned = strip_thinking(full_response)
                log_llm_call(role, messages, cleaned, self.model)
                return cleaned

    async def health_check(self) -> bool:
        """Calls GET http://localhost:11434/api/tags to verify Ollama is running."""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(f"{self.base_url}/api/tags")
                return response.status_code == 200
        except Exception:
            return False
