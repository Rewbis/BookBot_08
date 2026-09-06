from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional

from backend.services.tavily_service import TavilyService
from backend.services.llm_provider import provider as llm

router = APIRouter(prefix="/api/research", tags=["research"])
tavily_service = TavilyService()


class SearchRequest(BaseModel):
    query: str
    max_results: int = 5
    project_title: str = "unknown"

class ExtractRequest(BaseModel):
    url: str
    project_title: str = "unknown"

class SummariseResearchRequest(BaseModel):
    raw_content: str      # full text from search or extract
    source_label: str     # e.g. "Search: Victorian London" or "URL: https://..."
    context_elements: List[dict] = []
    project_title: str = "unknown"


def _check_tavily():
    if not tavily_service.is_configured():
        raise HTTPException(
            status_code=503,
            detail="TAVILY_API_KEY not set. Add it to .env to enable research."
        )


@router.get("/status")
async def research_status():
    return {"tavily_configured": tavily_service.is_configured()}


@router.post("/search")
async def search(req: SearchRequest):
    _check_tavily()
    try:
        result = await tavily_service.search(req.query, req.max_results)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Tavily error: {e}")

    # Flatten results into a single readable text block
    lines = [f"Search query: {result['query']}\n"]
    for i, r in enumerate(result["results"], 1):
        lines.append(f"[{i}] {r['title']}\n{r['url']}\n{r['content']}\n")
    raw_text = "\n".join(lines)

    return {
        "query":    result["query"],
        "results":  result["results"],
        "raw_text": raw_text,
    }


@router.post("/extract")
async def extract(req: ExtractRequest):
    _check_tavily()
    try:
        result = await tavily_service.extract(req.url)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Tavily error: {e}")
    return result   # {url, title, content}


@router.post("/summarise")
async def summarise_research(req: SummariseResearchRequest):
    """
    Summarise raw research content into a concise context element.
    Returns {content} — a 150-250 word summary focused on story-relevant facts.
    """
    sys_prompt = (
        "You are a research assistant helping a fiction author. "
        "Summarise the provided research material into 150–250 words, "
        "focusing only on facts that are directly useful for writing a believable, "
        "accurate story. Omit tangential detail, ads, navigation text, and metadata. "
        "Write in plain prose. No headers. No bullet points."
    )
    context_block = ""
    if req.context_elements:
        context_block = "\n\n## Project Context\n" + "\n".join(
            f"### {el.get('label','')}\n{el.get('content','')}"
            for el in req.context_elements
        )
    user_msg = (
        f"Source: {req.source_label}\n\n"
        f"## Raw Research\n{req.raw_content}"
        f"{context_block}"
    )
    messages = [
        {"role": "system", "content": sys_prompt},
        {"role": "user",   "content": user_msg},
    ]
    result = await llm.generate(
        messages, stream=False, project_title=req.project_title
    )
    return {"content": result}
