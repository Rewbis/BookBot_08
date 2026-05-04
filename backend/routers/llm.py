import os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional

from backend.services.ollama_service import OllamaService

router = APIRouter(prefix="/api/llm", tags=["llm"])
ollama_service = OllamaService()

class ContextElementBase(BaseModel):
    label: str
    content: str

class PlotterRequest(BaseModel):
    context_elements: List[ContextElementBase]
    system_prompt_override: Optional[str] = None
    role_name: str = "plotter"
    log_label: Optional[str] = None

class AntagonistRequest(BaseModel):
    context_elements: List[ContextElementBase]
    plotter_output: str
    system_prompt_override: Optional[str] = None
    log_label: Optional[str] = None

class RevisionRequest(BaseModel):
    context_elements: List[ContextElementBase]
    plotter_output: str
    antagonist_critique: str
    system_prompt_override: Optional[str] = None
    log_label: Optional[str] = None

class PriorSkeleton(BaseModel):
    number: int
    skeleton: str

class OutlinerRequest(BaseModel):
    context_elements: List[ContextElementBase]
    prior_skeletons: List[PriorSkeleton]
    chapter_number: int
    chapter_title: str
    intention: str
    scene_notes: str

def build_user_message(context_elements: List[ContextElementBase]) -> str:
    parts = []
    for el in context_elements:
        parts.append(f"## {el.label}\n{el.content}\n")
    return "\n".join(parts)

@router.post("/plotter")
async def run_plotter(req: PlotterRequest):
    sys_prompt = req.system_prompt_override or (
        "You are a creative writing plotter. Your role is to build a rich, coherent story world "
        "and plot structure based on the author's inputs. Return a structured world dictionary "
        "covering: characters (with motivations, voice, arc), locations, key events, themes, "
        "and a plot overview. Be specific and inventive. Return ONLY the world dictionary and plot overview. "
        "Do not generate chapter outlines or chapter-by-chapter breakdowns — that comes later. "
        "Focus on: characters, world, themes, and overall story arc only."
    )
    user_msg = build_user_message(req.context_elements)
    
    messages = [
        {"role": "system", "content": sys_prompt},
        {"role": "user", "content": user_msg}
    ]
    
    result = await ollama_service.generate(messages, stream=False)
    return {"content": result}

@router.post("/antagonist")
async def run_antagonist(req: AntagonistRequest):
    sys_prompt = req.system_prompt_override or (
        "You are a critical editor and story antagonist. Your role is to identify weaknesses, "
        "plot holes, inconsistencies, underdeveloped characters, and missed opportunities in "
        "the story plan provided. Be specific, constructive, and rigorous. List your critiques clearly."
    )
    user_msg = build_user_message(req.context_elements)
    user_msg += f"\n## Plotter Output\n{req.plotter_output}\n"
    
    messages = [
        {"role": "system", "content": sys_prompt},
        {"role": "user", "content": user_msg}
    ]
    
    result = await ollama_service.generate(messages, stream=False)
    return {"content": result}

@router.post("/plotter-revision")
async def run_revision(req: RevisionRequest):
    sys_prompt = req.system_prompt_override or (
        "You are a creative writing plotter. Your role is to build a rich, coherent story world "
        "and plot structure based on the author's inputs. Return a structured world dictionary "
        "covering: characters (with motivations, voice, arc), locations, key events, themes, "
        "and a plot overview. Be specific and inventive. "
        "Return ONLY the world dictionary and plot overview. "
        "Do not generate chapter outlines or chapter-by-chapter breakdowns — that comes later. "
        "Focus on: characters, world, themes, and overall story arc only."
        "You are revising your previous plan in response to editorial critique. Address the valid "
        "criticisms. Do not mention the critique process in your output — just produce an improved plan."
    )
    user_msg = build_user_message(req.context_elements)
    user_msg += f"\n## Plotter Output\n{req.plotter_output}\n"
    user_msg += f"\n## Antagonist Critique\n{req.antagonist_critique}\n"
    
    messages = [
        {"role": "system", "content": sys_prompt},
        {"role": "user", "content": user_msg}
    ]
    
    result = await ollama_service.generate(messages, stream=False)
    return {"content": result}

@router.post("/outliner")
async def run_outliner(req: OutlinerRequest):
    sys_prompt = (
        "You are a skilled story outliner. Your job is to write a concise chapter skeleton "
        "for the chapter specified. A skeleton should cover: the key events that occur, "
        "character motivations in this chapter, the emotional arc, and how the chapter "
        "ends. Be specific and concrete. Keep it to 200-400 words. Do not write prose — "
        "write a structured outline."
    )
    user_msg = build_user_message(req.context_elements)
    
    if req.prior_skeletons:
        for s in req.prior_skeletons:
            user_msg += f"## Chapter {s.number} Skeleton\n{s.skeleton}\n\n"
            
    user_msg += f"## Current Chapter\n"
    user_msg += f"Chapter {req.chapter_number}: {req.chapter_title}\n"
    user_msg += f"Intention: {req.intention}\n"
    user_msg += f"Scene Notes: {req.scene_notes}\n"
    
    messages = [
        {"role": "system", "content": sys_prompt},
        {"role": "user", "content": user_msg}
    ]
    
    result = await ollama_service.generate(messages, stream=False)
    return {"content": result}

@router.get("/health")
async def health_check():
    is_up = await ollama_service.health_check()
    if is_up:
        return {"status": "ok"}
    else:
        raise HTTPException(status_code=503, detail="Ollama is unreachable")

@router.get("/config")
async def get_config():
    return {"model_name": os.getenv("OLLAMA_MODEL", "")}