import os
import httpx
from typing import Optional

TAVILY_API_URL = "https://api.tavily.com"


class TavilyService:
    def __init__(self):
        self.api_key = os.getenv("TAVILY_API_KEY", "")

    def is_configured(self) -> bool:
        return bool(self.api_key)

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}

    async def search(self, query: str, max_results: int = 5) -> dict:
        """
        Keyword/topic search. Returns list of {title, url, content, score} results.
        """
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{TAVILY_API_URL}/search",
                headers=self._headers(),
                json={
                    "query": query,
                    "max_results": max_results,
                    "include_raw_content": False,
                },
            )
            if not resp.is_success:
                raise ValueError(f"Tavily search failed ({resp.status_code}): {resp.text}")
            data = resp.json()
        results = data.get("results", [])
        return {
            "query": query,
            "results": [
                {
                    "title":   r.get("title", ""),
                    "url":     r.get("url", ""),
                    "content": r.get("content", ""),
                    "score":   r.get("score", 0),
                }
                for r in results
            ],
        }

    async def extract(self, url: str) -> dict:
        """
        Fetch and extract the main text content of a single URL.
        Returns {url, title, content}.
        """
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{TAVILY_API_URL}/extract",
                headers=self._headers(),
                json={"urls": [url]},
            )
            if not resp.is_success:
                raise ValueError(f"Tavily extract failed ({resp.status_code}): {resp.text}")
            data = resp.json()
        results = data.get("results", [])
        if not results:
            failed = data.get("failed_results", [])
            reason = failed[0].get("error", "unknown") if failed else "no results returned"
            raise ValueError(f"Could not extract {url}: {reason}")
        r = results[0]
        return {
            "url":     r.get("url", url),
            "title":   r.get("title", ""),
            "content": r.get("raw_content", r.get("content", "")),
        }
