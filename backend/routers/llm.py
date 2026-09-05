import os
import re
import json
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional

from backend.services.ollama_service import OllamaService
from backend.services.claude_service import ClaudeService
from backend.utils.llm_json import parse_json_response
from backend.utils.model_config import get_model_config

router = APIRouter(prefix="/api/llm", tags=["llm"])
ollama_service = OllamaService()
claude_service = ClaudeService()

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

class ChapterPlanRequest(BaseModel):
    context_elements: List[ContextElementBase]
    prior_skeletons: List[PriorSkeleton]
    chapter_number: int
    chapter_title: str = ""   # may be empty — generate if so
    intention: str = ""
    scene_notes: str = ""
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
    target_words_per_chapter: int = 1500
    # Planted clues scheduled for this chapter: [{label, description, role: "plant"|"payoff"}]
    clues_due: List[dict] = []
    project_title: str = "unknown"

class ParseDumpRequest(BaseModel):
    dump_text: str
    project_title: str = "unknown"

class ContinuityRequest(BaseModel):
    context_elements: List[ContextElementBase]
    plotter_revision_output: str
    planted_clues: List[dict] = []
    continuity_issues: str = ""   # non-empty when re-running after a previous revise verdict
    project_title: str = "unknown"

class SummarisePremiseRequest(BaseModel):
    context_elements: List[ContextElementBase]
    premise: str
    project_title: str = "unknown"

class SummariseEnrichRequest(BaseModel):
    chapter_number: int
    chapter_title: str
    enrich_draft: str
    project_title: str = "unknown"

class DeriveStyleGuideRequest(BaseModel):
    style_sample: str
    project_title: str = "unknown"

def build_user_message(context_elements: List[ContextElementBase]) -> str:
    parts = []
    for el in context_elements:
        parts.append(f"## {el.label}\n{el.content}\n")
    return "\n".join(parts)

def build_clues_due_block(clues_due: List[dict]) -> str:
    """Render the clues scheduled for this chapter, split into plants and payoffs."""
    if not clues_due:
        return ""
    plants  = [c for c in clues_due if c.get("role") == "plant"]
    payoffs = [c for c in clues_due if c.get("role") == "payoff"]
    out = "## Clues Due In This Chapter\n"
    if plants:
        out += "Plant (introduce subtly, do not signpost as a clue):\n"
        out += "".join(f"- {c.get('label')}: {c.get('description')}\n" for c in plants)
    if payoffs:
        out += "Pay off (resolve or reveal what was set up earlier):\n"
        out += "".join(f"- {c.get('label')}: {c.get('description')}\n" for c in payoffs)
    return out + "\n"

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
    
    result = await claude_service.generate(messages, stream=False, project_title=req.project_title)
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
    
    result = await claude_service.generate(messages, stream=False, project_title=req.project_title)
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
    
    result = await claude_service.generate(messages, stream=False, project_title=req.project_title)
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
    
    result = await claude_service.generate(messages, stream=False, project_title=req.project_title)
    return {"content": result}

@router.post("/chapter-plan")
async def run_chapter_plan(req: ChapterPlanRequest):
    sys_prompt = (
        "You are a skilled story outliner. Generate a full chapter plan for the chapter specified.\n"
        "Return a JSON object with exactly these four keys:\n"
        "  title      — a punchy, evocative chapter title (5–10 words)\n"
        "  intention  — 1–2 sentences: what this chapter achieves for the story\n"
        "  scene_notes — 2–4 sentences: key beats, dialogue moments, devices, atmosphere\n"
        "  skeleton   — 200–400 words structured outline covering key events, character motivations, emotional arc, and chapter ending\n"
        "Any field that already has author-supplied content must be treated as a binding constraint — preserve the intent, do not contradict it.\n"
        "Return only valid JSON, no markdown fences."
    )
    user_msg = build_user_message(req.context_elements)

    if req.prior_skeletons:
        for s in req.prior_skeletons:
            user_msg += f"## Chapter {s.number} Skeleton\n{s.skeleton}\n\n"

    user_msg += f"## Chapter to Plan\nChapter {req.chapter_number}\n"
    if req.chapter_title:
        user_msg += f"Author-supplied title (use as seed): {req.chapter_title}\n"
    if req.intention:
        user_msg += f"Author-supplied intention (binding constraint): {req.intention}\n"
    if req.scene_notes:
        user_msg += f"Author-supplied scene notes (binding constraint): {req.scene_notes}\n"

    messages = [
        {"role": "system", "content": sys_prompt},
        {"role": "user", "content": user_msg}
    ]

    raw = await claude_service.generate(messages, stream=False, project_title=req.project_title)
    return parse_json_response(raw)

DE_AI_RULES = """
ANTI-AI WRITING RULES — avoid all of the following:
- Overused words: delve, navigate, tapestry, nuanced, multifaceted, pivotal, underscore, foster, moreover, furthermore, it's worth noting, in conclusion, in summary, it is important to note
- Em-dash overuse: use sparingly, not in every paragraph
- Excessive hedging: "it could be argued", "one might say", "in many ways"
- Overly smooth transitions: vary sentence openings, avoid formulaic connectors
- Balanced "on one hand / on the other hand" constructions where prose would be more natural
- Bullet lists masquerading as prose
- Generic or thesis-statement opening sentences
- Passive constructions where active voice is more natural
- Repetitive sentence rhythm (vary length and structure)
"""

@router.post("/chapter-draft")
async def run_chapter_draft(req: ChapterWriteRequest):
    sys_prompt = (
        "You are a narrative fiction writer. Write a complete draft of this chapter in full prose.\n"
        "Follow this sequence within your draft:\n"
        "1. Establish the scene with specific sensory atmosphere (light, sound, smell, texture, temperature).\n"
        "2. Write all key actions and events — what physically happens, decisions made, consequences.\n"
        "3. Where dialogue would naturally occur, write a placeholder: [DIALOGUE: {character} says something to the effect of {brief intent}]\n"
        "Keep character voices, motivations, and emotional states consistent with their profiles.\n"
        "If a 'Clues Due In This Chapter' section is present, every item in it must appear in the prose — "
        "plants woven in naturally, payoffs resolved on the page.\n"
        f"Target length: approximately {req.target_words_per_chapter} words.\n"
        "Return ONLY the chapter prose. No commentary, no headers."
    )
    user_msg = build_user_message(req.context_elements)
    for summary in req.prior_chapter_summaries:
        user_msg += f"## Chapter {summary.get('number')} Summary: {summary.get('title')}\n{summary.get('summary')}\n\n"
    if req.preceding_chapter_tail:
        user_msg += f"## End of Previous Chapter\n{req.preceding_chapter_tail}\n\n"
    user_msg += build_clues_due_block(req.clues_due)
    user_msg += f"## Chapter to Write\nChapter {req.chapter_number}: {req.chapter_title}\n\nSkeleton:\n{req.chapter_skeleton}\n"

    messages = [
        {"role": "system", "content": sys_prompt},
        {"role": "user", "content": user_msg}
    ]
    result = await claude_service.generate(messages, stream=False, project_title=req.project_title)
    return {"content": result}

@router.post("/chapter-enrich")
async def run_chapter_enrich(req: ChapterWriteRequest):
    sys_prompt = (
        "You are a prose editor performing a single enrichment pass on a draft chapter. Do all of the following in one pass:\n"
        "1. DIALOGUE: Replace every [DIALOGUE: ...] placeholder with natural, character-appropriate spoken dialogue. "
        "Each character must speak in their established voice — reflecting their background, education, and emotional state. "
        "Dialogue must reveal character and advance the scene.\n"
        "2. SENSORY: Layer in any missing sensory detail (sound, smell, texture, temperature) where it serves atmosphere. "
        "Do not duplicate detail already present.\n"
        "3. STYLE: Align vocabulary, sentence rhythm, and register with the stated genre, tone, and audience. "
        "Fix awkward phrasing, repetition, and tonal inconsistency. "
        "If the context contains a 'Style Guide', follow it exactly. If it contains a 'Writing Sample', "
        "imitate that sample's sentence rhythm, dialogue habits, and register directly — the author's own "
        "prose overrides generic genre style.\n"
        f"{DE_AI_RULES}\n"
        "Do not change plot events. Return the complete enriched chapter text. No commentary."
    )
    user_msg = build_user_message(req.context_elements)
    user_msg += f"## Chapter Draft\n{req.current_draft}\n"

    messages = [
        {"role": "system", "content": sys_prompt},
        {"role": "user", "content": user_msg}
    ]
    result = await claude_service.generate(messages, stream=False, project_title=req.project_title)
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
        "If a 'Clues Due In This Chapter' section is present, check each item: state whether it "
        "was planted or paid off in the draft, and flag any that are missing or too heavy-handed. "
        "List your critiques clearly and concisely."
    )
    user_msg = build_user_message(req.context_elements)
    for summary in req.prior_chapter_summaries:
        user_msg += f"## Chapter {summary.get('number')} Summary: {summary.get('title')}\n{summary.get('summary')}\n\n"

    user_msg += build_clues_due_block(req.clues_due)
    user_msg += f"## Chapter Draft\n{req.current_draft}\n"
    
    if req.critic_feedback:
        user_msg += f"## Previous Critic Feedback\n{req.critic_feedback}\nNote: assess whether previous issues have been addressed.\n"
        
    messages = [
        {"role": "system", "content": sys_prompt},
        {"role": "user", "content": user_msg}
    ]
    
    result = await claude_service.generate(messages, stream=False, project_title=req.project_title)
    return {"content": result}

@router.post("/chapter-polish")
async def run_chapter_polish(req: ChapterWriteRequest):
    sys_prompt = (
        "You are a prose style editor performing a final polish pass. "
        "Given a chapter draft and specific critic feedback, address the valid criticisms "
        "and improve the text accordingly. Do not mention the critique process in your "
        "output — simply return an improved version of the chapter. "
        "Preserve all plot events, character voices, and dialogue unless the critic "
        "specifically flagged them as wrong. "
        "If the context contains a 'Style Guide', every sentence you touch must conform to it; "
        "if it contains a 'Writing Sample', match that sample's rhythm and register rather than "
        "a neutral literary default.\n"
        f"{DE_AI_RULES}"
    )
    user_msg = build_user_message(req.context_elements)
    user_msg += f"## Chapter Draft\n{req.current_draft}\n"
    user_msg += f"## Critic Feedback\n{req.critic_feedback}\n"
    
    messages = [
        {"role": "system", "content": sys_prompt},
        {"role": "user", "content": user_msg}
    ]
    
    result = await claude_service.generate(messages, stream=False, project_title=req.project_title)
    return {"content": result}

@router.post("/chapter-summary")
async def run_chapter_summary(req: ChapterWriteRequest):
    sys_prompt = (
        "You are a precise summariser. Given a completed chapter, write a factual "
        "summary of 200-300 words covering: the key events in order; what each main "
        "character now knows, wants, and where they are; any change in relationships, "
        "injuries, possessions, or status; any clue, motif, or promise planted or paid off; "
        "and the emotional state at the chapter's end. This summary is the memory of this "
        "chapter for every later chapter — be specific about facts, names, and places, "
        "not vague about themes."
    )
    user_msg = f"## Chapter {req.chapter_number}: {req.chapter_title}\n{req.current_draft}\n"
    
    messages = [
        {"role": "system", "content": sys_prompt},
        {"role": "user", "content": user_msg}
    ]
    
    result = await claude_service.generate(messages, stream=False, project_title=req.project_title)
    return {"content": result}

@router.post("/continuity")
async def run_continuity(req: ContinuityRequest):
    clues_json = json.dumps(req.planted_clues, indent=2) if req.planted_clues else "[]"
    prior_issues = (
        f"\n\nNote: this is a re-run. The previous continuity check raised these issues:\n{req.continuity_issues}\n"
        "Verify whether the revised plan has addressed them."
    ) if req.continuity_issues else ""

    sys_prompt = (
        "You are a continuity editor and story coherence analyst. You will be given a revised plot plan "
        "and a list of planted clues (foreshadowing elements, motifs, cross-chapter callbacks).\n\n"
        "Your job:\n"
        "1. Verify every planted clue against the plan — check for contradictions, impossible payoffs, "
        "or setups that no longer exist.\n"
        "2. Update each clue's status: 'active' (valid, keep tracking) or 'blocked' "
        "(contradicted, impossible, or the setup/payoff no longer exists — state why).\n"
        "3. Flag any plot-level continuity issues that must be fixed before chapter outlining.\n"
        "4. Return a verdict: 'approve' if the plan is ready for outlining, 'revise' if specific "
        "issues must be fixed first.\n\n"
        "Return ONLY a valid JSON object — no markdown, no code fences:\n"
        "{\n"
        '  "verdict": "approve" | "revise",\n'
        '  "summary": "2-3 sentence overall assessment",\n'
        '  "issues": ["specific issue if revise, else empty array"],\n'
        '  "clue_updates": [\n'
        '    {"id": "clue_id", "status": "active|blocked", '
        '"notes": "specific reason — why blocked, or confirmation it is still active"}\n'
        "  ]\n"
        "}"
        + prior_issues
    )
    user_msg = build_user_message(req.context_elements)
    user_msg += f"\n## Revised Plot Plan\n{req.plotter_revision_output}\n"
    user_msg += f"\n## Planted Clues\n```json\n{clues_json}\n```\n"

    messages = [
        {"role": "system", "content": sys_prompt},
        {"role": "user", "content": user_msg},
    ]
    result = await claude_service.generate(messages, stream=False, project_title=req.project_title)
    return parse_json_response(result)


@router.post("/summarise-premise")
async def run_summarise_premise(req: SummarisePremiseRequest):
    sys_prompt = (
        "You are a precise summariser. Given a full story premise and plot treatment, write a "
        "compressed summary of 200-300 words suitable for agents that need the essential story "
        "arc without the full detail. Cover: genre/tone, the central conflict, the protagonist's "
        "goal, the main antagonist force, the three-act structure in one sentence each, and how "
        "it ends. Be specific — names, places, stakes — not vague."
    )
    user_msg = build_user_message(req.context_elements)
    user_msg += f"\n## Full Premise\n{req.premise}\n"

    messages = [
        {"role": "system", "content": sys_prompt},
        {"role": "user", "content": user_msg},
    ]
    result = await claude_service.generate(messages, stream=False, project_title=req.project_title)
    return {"content": result}


@router.post("/derive-style-guide")
async def run_derive_style_guide(req: DeriveStyleGuideRequest):
    sys_prompt = (
        "You are a prose style analyst. Given a sample of an author's own writing, produce a "
        "Style Guide of 250-350 words that another writer could follow to imitate this author "
        "convincingly. Cover, quoting short phrases from the sample where they make a point concrete:\n"
        "- Narrative point of view and tense, and how strictly they are held\n"
        "- Sentence length and rhythm: typical length, how it varies, use of fragments or run-ons\n"
        "- Paragraph length and how scenes are broken up\n"
        "- Vocabulary register, recurring word choices, level of formality\n"
        "- Dialogue: tags used, action beats, dialect or idiom, how much is said versus implied\n"
        "- Imagery and sensory tendencies: which senses, how much, how literal or figurative\n"
        "- Tone and humour, and how they are delivered\n"
        "- Pacing habits: where the author lingers, where they cut\n"
        "- Signature moves that make the prose recognisably this author's\n"
        "- Things this author does NOT do that a language model typically would\n"
        "Write it as direct instructions to a writer ('Use…', 'Keep…', 'Avoid…'). "
        "No preamble, no headings other than short labels, no commentary on quality."
    )
    user_msg = f"## Writing Sample\n\n{req.style_sample}\n"
    messages = [
        {"role": "system", "content": sys_prompt},
        {"role": "user", "content": user_msg},
    ]
    result = await claude_service.generate(messages, stream=False, project_title=req.project_title)
    return {"content": result}


@router.post("/chapter-summarise-enrich")
async def run_chapter_summarise_enrich(req: SummariseEnrichRequest):
    sys_prompt = (
        "You are a precise summariser. Given a fully enriched chapter draft, write a factual "
        "summary of 80-120 words covering: key events that occurred, how each main character's "
        "situation or knowledge changed, any planted clues or motifs that appeared, and the "
        "emotional state at the chapter's end. This summary is used as a compact reference for "
        "downstream agents — be specific about facts, not vague about themes."
    )
    user_msg = (
        f"## Chapter {req.chapter_number}: {req.chapter_title}\n\n"
        f"{req.enrich_draft}\n"
    )

    messages = [
        {"role": "system", "content": sys_prompt},
        {"role": "user", "content": user_msg},
    ]
    result = await claude_service.generate(messages, stream=False, project_title=req.project_title)
    return {"content": result}


@router.post("/parse-dump")
async def run_parse_dump(req: ParseDumpRequest):
    sys_prompt = (
        "You are a story structure analyst. Given a raw creative dump from an author, extract and organise it into five clean fields. "
        "Return ONLY a valid JSON object — no markdown, no code fences, no explanation.\n\n"
        "Required JSON structure:\n"
        "{\n"
        '  "role_constraints": "Genre conventions, tone, narrative style, hard rules — concise, goes in every system prompt",\n'
        '  "premise": "Full plot treatment: overarching themes, structure, arc, cases/acts, key tensions and how they resolve",\n'
        '  "characters": "Per-character sketches: name, role, motivation, voice notes, key relationships",\n'
        '  "world_notes": "Setting details, world-specific canon, magic or technology systems relevant to the story",\n'
        '  "planted_clues": [\n'
        '    {"id": "clue_1", "label": "Short clue name", "description": "What it is and how it appears", '
        '"planted_in": "Where first introduced", "pays_off_in": "Where it resolves or pays off", "status": "active"}\n'
        '  ]\n'
        "}\n\n"
        "For planted_clues, identify all foreshadowing elements, hidden connections, recurring motifs, and cross-case callbacks "
        "that span multiple chapters or plot threads. Each should be a discrete, trackable item."
    )
    user_msg = f"## Creative Dump\n\n{req.dump_text}"
    messages = [
        {"role": "system", "content": sys_prompt},
        {"role": "user", "content": user_msg},
    ]
    result = await claude_service.generate(messages, stream=False, project_title=req.project_title)
    # Strip markdown code fences if the model adds them
    return parse_json_response(result)


@router.get("/health")
async def health_check():
    is_up = await ollama_service.health_check()
    if is_up:
        return {"status": "ok"}
    else:
        raise HTTPException(status_code=503, detail="Ollama is unreachable")

@router.get("/config")
async def get_config():
    # Generation model + context budget settings the frontend uses for the token bar.
    return get_model_config()