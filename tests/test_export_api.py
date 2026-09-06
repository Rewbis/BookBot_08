"""
/api/export via a minimal app (no llm/research routers, so no API keys needed).
"""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.routers import export as export_router
from backend.routers import project as project_router


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(export_router, "PROJECTS_DIR", str(tmp_path))
    monkeypatch.setattr(project_router, "PROJECTS_DIR", str(tmp_path))
    app = FastAPI()
    app.include_router(export_router.router)
    app.include_router(project_router.router)
    return TestClient(app)


def approved_project(client, title="Round Trip"):
    proj = client.post("/api/project/new").json()
    proj["title"] = title
    proj["chapters"] = [{
        "id": "c1", "number": 1, "title": "Landfall", "intention": "", "scene_notes": "", "skeleton": "",
        "summary": "", "full_text": "Mara arrived.\n\nThe tide turned.", "order": 1, "status": "drafted",
        "approved": True,
    }]
    return proj


def test_export_md_then_download(client):
    proj = approved_project(client)
    r = client.post("/api/export/manuscript", json={"project": proj, "format": "md", "author": "A. Writer"})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["chapters_included"] == 1 and d["format"] == "md" and d["warnings"] == []
    assert d["url"].startswith("/api/export/download/round_trip/")
    assert "path" not in d

    dl = client.get(d["url"])
    assert dl.status_code == 200
    assert dl.headers["content-type"].startswith("text/markdown")
    assert "## Chapter 1: Landfall" in dl.text

    comp = client.get(d["companion_url"])
    assert comp.status_code == 200 and "TITLE: Round Trip" in comp.text
    ctx = client.get(d["context_url"])
    assert ctx.status_code == 200 and "# Round Trip — context artefacts" in ctx.text


def test_export_epub_content_type(client):
    r = client.post("/api/export/manuscript", json={"project": approved_project(client), "format": "epub"})
    assert r.status_code == 200
    dl = client.get(r.json()["url"])
    assert dl.status_code == 200
    assert dl.headers["content-type"].startswith("application/epub+zip")
    assert dl.content[:2] == b"PK"          # it's a zip


def test_export_rejects_bad_format_and_empty_book(client):
    proj = approved_project(client)
    assert client.post("/api/export/manuscript", json={"project": proj, "format": "pdf"}).status_code == 400
    proj["chapters"][0]["approved"] = False
    r = client.post("/api/export/manuscript", json={"project": proj, "format": "md"})
    assert r.status_code == 400 and "approve" in r.json()["detail"].lower()
    r = client.post("/api/export/manuscript", json={"project": proj, "format": "md", "include_unapproved": True})
    assert r.status_code == 200 and any("not approved" in w for w in r.json()["warnings"])


def test_validate_endpoint_guards(client):
    proj = approved_project(client)
    md = client.post("/api/export/manuscript", json={"project": proj, "format": "md"}).json()
    r = client.post("/api/export/validate", json={"slug": md["slug"], "filename": md["filename"]})
    assert r.status_code == 400 and "epub" in r.json()["detail"]
    r = client.post("/api/export/validate", json={"slug": "round_trip", "filename": "missing.epub"})
    assert r.status_code == 404
    r = client.post("/api/export/validate", json={"slug": "../x", "filename": "a.epub"})
    assert r.status_code == 400


def test_validate_endpoint_returns_a_result_shape(client):
    proj = approved_project(client)
    ep = client.post("/api/export/manuscript", json={"project": proj, "format": "epub"}).json()
    r = client.post("/api/export/validate", json={"slug": ep["slug"], "filename": ep["filename"]})
    assert r.status_code == 200
    d = r.json()
    assert "available" in d
    if d["available"]:
        assert set(d) >= {"valid", "errors", "warnings", "messages", "version"}
    else:
        assert d["reason"]


def test_download_refuses_traversal_and_missing(client):
    assert client.get("/api/export/download/..%2F..%2Fx/y.md").status_code in (400, 404)
    assert client.get("/api/export/download/round_trip/nope.md").status_code == 404
    assert client.get("/api/export/download/round_trip/..%2Fsecret.txt").status_code in (400, 404)
