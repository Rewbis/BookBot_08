from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Dict, Any
from backend.services.token_service import TokenService
from backend.utils.usage_tracker import tracker as usage_tracker

router = APIRouter(prefix="/api/tokens", tags=["tokens"])
token_service = TokenService()

class TextRequest(BaseModel):
    text: str

@router.post("/count")
async def count_tokens(req: TextRequest):
    return {"token_count": token_service.count_tokens(req.text)}

@router.post("/elements")
async def count_elements(elements: List[Dict[str, Any]]):
    updated = token_service.count_elements(elements)
    total = token_service.total_tokens(updated)
    return {"elements": updated, "total": total}

@router.get("/usage")
async def get_usage():
    return usage_tracker.summary()

@router.post("/usage/reset")
async def reset_usage():
    usage_tracker.reset()
    return {"status": "reset"}
