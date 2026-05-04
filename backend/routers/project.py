import os
import uuid
from datetime import datetime
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
import re

from backend.models.schemas import BookProject
from backend.utils.snapshot import save_snapshot, load_snapshot, suggest_filename

router = APIRouter(prefix="/api/project", tags=["project"])
PROJECTS_DIR = "projects"

class SaveRequest(BaseModel):
    project: BookProject
    custom_filename: Optional[str] = None

class LoadRequest(BaseModel):
    filepath: str

@router.post("/save")
async def save_project(req: SaveRequest):
    filename = req.custom_filename
    if not filename:
        filename = suggest_filename(req.project)
    
    os.makedirs(PROJECTS_DIR, exist_ok=True)
    filepath = os.path.join(PROJECTS_DIR, filename)
    saved_path = save_snapshot(req.project, filepath)
    
    return {"filepath": saved_path, "filename": filename}

@router.post("/load")
async def load_project(req: LoadRequest):
    return load_snapshot(req.filepath)

@router.get("/list")
async def list_projects():
    if not os.path.exists(PROJECTS_DIR):
        return []
    
    files = []
    for f in os.listdir(PROJECTS_DIR):
        if f.endswith(".json"):
            path = os.path.join(PROJECTS_DIR, f)
            stat = os.stat(path)
            files.append({
                "filename": f,
                "size": stat.st_size,
                "modified_date": datetime.fromtimestamp(stat.st_mtime).isoformat()
            })
    return files

@router.get("/suggest-filename")
async def suggest_filename_route(title: str):
    title_clean = title.lower()
    title_clean = re.sub(r'[^a-z0-9\s-]', '', title_clean)
    title_clean = re.sub(r'[\s-]+', '_', title_clean).strip('_')
    if not title_clean:
        title_clean = "untitled"
    now = datetime.now()
    filename = f"bookbot_{title_clean}_{now.strftime('%Y%m%d_%H%M')}.json"
    return {"filename": filename}

@router.post("/new")
async def new_project():
    now = datetime.now().isoformat()
    return BookProject(
        id=str(uuid.uuid4()),
        title="New Project",
        genre="",
        tone="",
        audience="",
        target_word_count=50000,
        target_chapter_count=20,
        phase="A",
        context_elements=[],
        chapters=[],
        world_dict={},
        antagonist_rounds=1,
        model_name="qwen3-14b-abliterated:Q4_K_M",
        created_at=now,
        updated_at=now,
        snapshot_notes=""
    )
