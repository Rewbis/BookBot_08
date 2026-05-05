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
    project_title: str = "unknown"

class AntagonistRequest(BaseModel):
    context_elements: List[ContextElementBase]
    plotter_output: str
    system_prompt_override: Optional[str] = None
    log_label: Optional[str] = None
    project_title: str = "unknown"

class RevisionRequest(BaseModel):
    context_elements: List[ContextElementBase]
    plotter_output: str
    antagonist_critique: str
    system_prompt_override: Optional[str] = None
    log_label: Optional[str] = None
    project_title: str = "unknown"

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
    project_title: str = "unknown"

class ChapterWriteRequest(BaseModel):
    context_elements: List[ContextElementBase]
    prior_chapter_summaries: List[dict]
    preceding_chapter_tail: str
    chapter_number: int
    chapter_title: str
    chapter_skeleton: str
    current_draft: str
    critic_feedback: str
    antagonist_rounds: int = 1
    target_words_per_chapter: int = 1500
    project_title: str = "unknown"

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
    
    result = await ollama_service.generate(messages, stream=False, project_title=req.project_title)
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
    
    result = await ollama_service.generate(messages, stream=False, project_title=req.project_title)
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
    
    result = await ollama_service.generate(messages, stream=False, project_title=req.project_title)
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
    
    result = await ollama_service.generate(messages, stream=False, project_title=req.project_title)
    return {"content": result}

@router.post("/chapter-actions")
async def run_chapter_actions(req: ChapterWriteRequest):
    sys_prompt = (
        "You are a narrative writer specialising in plot and action. Given the chapter "
        "skeleton and context, write the key actions and events of this chapter in full "
        "prose. Focus on WHAT HAPPENS — the physical events, decisions, and consequences. "
        "Do not write dialogue yet — use placeholder tags like [DIALOGUE: character says "
        "something to the effect of X] where dialogue would naturally occur. "
        "Keep character voices consistent with their established profiles. "
        f"Write approximately {req.target_words_per_chapter} words."
    )
    user_msg = build_user_message(req.context_elements)
    
    for summary in req.prior_chapter_summaries:
        user_msg += f"## Chapter {summary.get('number')} Summary: {summary.get('title')}\n{summary.get('summary')}\n\n"
        
    if req.preceding_chapter_tail:
        user_msg += f"## End of Previous Chapter\n{req.preceding_chapter_tail}\n\n"
        
    user_msg += f"## Current Chapter\nChapter {req.chapter_number}: {req.chapter_title}\n\nSkeleton:\n{req.chapter_skeleton}\n"
    
    messages = [
        {"role": "system", "content": sys_prompt},
        {"role": "user", "content": user_msg}
    ]
    
    result = await ollama_service.generate(messages, stream=False, project_title=req.project_title)
    return {"content": result}

@router.post("/chapter-sensory")
async def run_chapter_sensory(req: ChapterWriteRequest):
    sys_prompt = (
        "You are a narrative writer specialising in atmosphere, setting and sensory detail. "
        "Given a draft chapter, enrich it with vivid sensory details, atmosphere, and "
        "descriptive passages. Add smell, sound, texture, temperature, and visual detail "
        "where they serve the scene. Do not change plot events or add new ones. "
        "Do not write dialogue — leave [DIALOGUE] placeholders in place. "
        "Return the complete enriched chapter text."
    )
    user_msg = build_user_message(req.context_elements)
    user_msg += f"## Chapter Draft\n{req.current_draft}\n"
    
    messages = [
        {"role": "system", "content": sys_prompt},
        {"role": "user", "content": user_msg}
    ]
    
    result = await ollama_service.generate(messages, stream=False, project_title=req.project_title)
    return {"content": result}

@router.post("/chapter-dialogue")
async def run_chapter_dialogue(req: ChapterWriteRequest):
    sys_prompt = (
        "You are a dialogue writer. Given a draft chapter with [DIALOGUE] placeholders, "
        "replace each placeholder with natural, character-appropriate dialogue. "
        "Each character should speak in their established voice — consider their background, "
        "education, emotional state, and relationship to the person they are addressing. "
        "Dialogue should reveal character and advance the scene. "
        "Do not change any non-dialogue prose. Return the complete chapter text."
    )
    user_msg = build_user_message(req.context_elements)
    user_msg += f"## Chapter Draft\n{req.current_draft}\n"
    
    messages = [
        {"role": "system", "content": sys_prompt},
        {"role": "user", "content": user_msg}
    ]
    
    result = await ollama_service.generate(messages, stream=False, project_title=req.project_title)
    return {"content": result}

@router.post("/chapter-style")
async def run_chapter_style(req: ChapterWriteRequest):
    sys_prompt = (
        "You are a prose style editor. Given a draft chapter, edit it for consistency "
        "of style, voice, and tone as established by the project parameters. "
        "Ensure vocabulary, sentence length, and register are appropriate for the "
        "stated audience and genre. Fix any awkward phrasing, repetition, or tonal "
        "inconsistency. Do not change plot events or dialogue content — only improve "
        "how things are expressed. Return the complete edited chapter text."
    )
    user_msg = build_user_message(req.context_elements)
    user_msg += f"## Chapter Draft\n{req.current_draft}\n"
    
    messages = [
        {"role": "system", "content": sys_prompt},
        {"role": "user", "content": user_msg}
    ]
    
    result = await ollama_service.generate(messages, stream=False, project_title=req.project_title)
    return {"content": result}

@router.post("/chapter-critic")
async def run_chapter_critic(req: ChapterWriteRequest):
    sys_prompt = (
        "You are a rigorous literary critic and editor. Given a completed chapter draft, "
        "identify specific weaknesses: plot inconsistencies, character voice violations, "
        "pacing issues, unresolved setup, tonal mismatches with the project, "
        "missing emotional beats, or prose quality issues. "
        "Be specific — quote the problematic passage and explain the issue. "
        "Be constructive — suggest what should change and why. "
        "List your critiques clearly and concisely."
    )
    user_msg = build_user_message(req.context_elements)
    for summary in req.prior_chapter_summaries:
        user_msg += f"## Chapter {summary.get('number')} Summary: {summary.get('title')}\n{summary.get('summary')}\n\n"
    
    user_msg += f"## Chapter Draft\n{req.current_draft}\n"
    
    if req.critic_feedback:
        user_msg += f"## Previous Critic Feedback\n{req.critic_feedback}\nNote: assess whether previous issues have been addressed.\n"
        
    messages = [
        {"role": "system", "content": sys_prompt},
        {"role": "user", "content": user_msg}
    ]
    
    result = await ollama_service.generate(messages, stream=False, project_title=req.project_title)
    return {"content": result}

@router.post("/chapter-polish")
async def run_chapter_polish(req: ChapterWriteRequest):
    sys_prompt = (
        "You are a prose style editor performing a final polish pass. "
        "Given a chapter draft and specific critic feedback, address the valid criticisms "
        "and improve the text accordingly. Do not mention the critique process in your "
        "output — simply return an improved version of the chapter. "
        "Preserve all plot events, character voices, and dialogue unless the critic "
        "specifically flagged them as wrong."
    )
    user_msg = build_user_message(req.context_elements)
    user_msg += f"## Chapter Draft\n{req.current_draft}\n"
    user_msg += f"## Critic Feedback\n{req.critic_feedback}\n"
    
    messages = [
        {"role": "system", "content": sys_prompt},
        {"role": "user", "content": user_msg}
    ]
    
    result = await ollama_service.generate(messages, stream=False, project_title=req.project_title)
    return {"content": result}

@router.post("/chapter-summary")
async def run_chapter_summary(req: ChapterWriteRequest):
    sys_prompt = (
        "You are a precise summariser. Given a completed chapter, write a concise "
        "summary of 100-150 words covering: the key events that occurred, how each "
        "main character's situation changed, and the emotional state at the chapter's "
        "end. This summary will be used as context for writing subsequent chapters — "
        "be specific about facts, not vague about themes."
    )
    user_msg = f"## Chapter {req.chapter_number}: {req.chapter_title}\n{req.current_draft}\n"
    
    messages = [
        {"role": "system", "content": sys_prompt},
        {"role": "user", "content": user_msg}
    ]
    
    result = await ollama_service.generate(messages, stream=False, project_title=req.project_title)
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