"""
API tests for the /api/project router.

Builds a minimal FastAPI app with only this router so the test never imports
the llm/research routers (which instantiate the Anthropic/Tavily clients and
need API keys at import time).
"""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.routers import project as project_router


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(project_router, "PROJECTS_DIR", str(tmp_path))
    app = FastAPI()
    app.include_router(project_router.router)
    return TestClient(app)


def test_new_project_defaults(client):
    r = client.post("/api/project/new")
    assert r.status_code == 200
    d = r.json()
    assert d["title"] == "New Project"
    assert d["phase"] == "A"
    assert d["target_chapter_count"] == 20
    assert d["planted_clues"] == []
    assert d["plotter_output"] == ""


def test_list_is_empty_when_no_saves(client):
    assert client.get("/api/project/list").json() == []


def test_save_list_load_round_trip(client):
    proj = client.post("/api/project/new").json()
    proj["title"] = "Round Trip"
    proj["plotter_output"] = "the plan"

    saved = client.post("/api/project/save", json={"project": proj})
    assert saved.status_code == 200
    filename = saved.json()["filename"]
    assert filename.startswith("bookbot_round_trip_")

    listed = client.get("/api/project/list").json()
    assert [f["filename"] for f in listed] == [filename]
    assert listed[0]["size"] > 0

    loaded = client.post("/api/project/load", json={"filepath": saved.json()["filepath"]})
    assert loaded.status_code == 200
    assert loaded.json()["title"] == "Round Trip"
    assert loaded.json()["plotter_output"] == "the plan"


def test_custom_filename_is_honoured(client):
    proj = client.post("/api/project/new").json()
    r = client.post("/api/project/save", json={"project": proj, "custom_filename": "mine.json"})
    assert r.json()["filename"] == "mine.json"
    assert [f["filename"] for f in client.get("/api/project/list").json()] == ["mine.json"]


def test_suggest_filename_route_sanitises(client):
    r = client.get("/api/project/suggest-filename", params={"title": "Hello, World!"})
    assert r.json()["filename"].startswith("bookbot_hello_world_")
