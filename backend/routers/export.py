import os
import re

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from backend.models.schemas import BookProject
from backend.utils.epub_validate import validate_epub
from backend.utils.manuscript import FORMATS, export_manuscript

router = APIRouter(prefix="/api/export", tags=["export"])
PROJECTS_DIR = "projects"

_SAFE = re.compile(r"^[A-Za-z0-9_.-]+$")
_MEDIA = {
    "epub": "application/epub+zip",
    "md": "text/markdown; charset=utf-8",
    "txt": "text/plain; charset=utf-8",
}


class ExportRequest(BaseModel):
    project: BookProject
    format: str = "epub"
    author: str = ""
    include_unapproved: bool = False

class ValidateRequest(BaseModel):
    slug: str
    filename: str


def _export_path(slug: str, filename: str) -> str:
    # Only ever touch projects/<slug>/export/ — no path components allowed.
    if not (_SAFE.match(slug) and _SAFE.match(filename)) or ".." in slug or ".." in filename:
        raise HTTPException(status_code=400, detail="bad path")
    path = os.path.join(PROJECTS_DIR, slug, "export", filename)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="file not found")
    return path


@router.post("/manuscript")
async def export_manuscript_route(req: ExportRequest):
    if req.format not in FORMATS:
        raise HTTPException(status_code=400, detail=f"format must be one of {list(FORMATS)}")
    try:
        result = export_manuscript(req.project, req.format, req.author, req.include_unapproved, PROJECTS_DIR)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    result["url"] = f"/api/export/download/{result['slug']}/{result['filename']}"
    result["companion_url"] = f"/api/export/download/{result['slug']}/{result['companion']}"
    result["context_url"] = f"/api/export/download/{result['slug']}/{result['context_file']}"
    result.pop("path", None)
    return result


@router.get("/download/{slug}/{filename}")
async def download(slug: str, filename: str):
    path = _export_path(slug, filename)
    ext = filename.rsplit(".", 1)[-1].lower()
    return FileResponse(path, filename=filename, media_type=_MEDIA.get(ext, "application/octet-stream"))


@router.post("/validate")
async def validate(req: ValidateRequest):
    if not req.filename.lower().endswith(".epub"):
        raise HTTPException(status_code=400, detail="only .epub files can be validated")
    path = _export_path(req.slug, req.filename)
    return validate_epub(path)
