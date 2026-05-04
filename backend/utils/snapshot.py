import json
import os
import re
from datetime import datetime
from backend.models.schemas import BookProject

def save_snapshot(project: BookProject, filepath: str) -> str:
    project.updated_at = datetime.now().isoformat()
    # Serialize to JSON string then parse to dict to dump cleanly
    data = project.model_dump(by_alias=True)
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    return filepath

def load_snapshot(filepath: str) -> BookProject:
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)
    return BookProject(**data)

def suggest_filename(project: BookProject) -> str:
    # bookbot_{sanitised_title}_{YYYYMMDD}_{HHMM}.json
    title = project.title.lower()
    title = re.sub(r'[^a-z0-9\s-]', '', title)
    title = re.sub(r'[\s-]+', '_', title).strip('_')
    if not title:
        title = "untitled"
    now = datetime.now()
    return f"bookbot_{title}_{now.strftime('%Y%m%d_%H%M')}.json"
