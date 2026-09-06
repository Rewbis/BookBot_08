import shutil
from datetime import datetime

import pytest

from backend.models.schemas import BookProject, Chapter
from backend.utils.epub_validate import validate_epub
from backend.utils.manuscript import export_manuscript

HAS_JAVA = shutil.which("java") is not None


def make_epub(tmp_path):
    now = datetime.now().isoformat()
    p = BookProject(
        id="p", title="Validation Test", target_word_count=100, target_chapter_count=1, phase="D",
        context_elements=[], model_name="m", created_at=now, updated_at=now, author="A. Writer",
        chapters=[Chapter(id="c1", number=1, title="One", intention="", scene_notes="", skeleton="", summary="",
                          full_text="First paragraph.\n\nSecond paragraph.", order=1, status="drafted", approved=True)],
    )
    return export_manuscript(p, "epub", "", False, str(tmp_path))["path"]


def test_missing_file():
    assert validate_epub("nope.epub") == {"available": False, "reason": "file not found"}


@pytest.mark.skipif(not HAS_JAVA, reason="Java runtime not on PATH")
def test_our_epub_passes_epubcheck(tmp_path):
    res = validate_epub(make_epub(tmp_path))
    assert res["available"] is True, res
    assert res["errors"] == 0 and res["fatal"] == 0, res["messages"]
    assert res["valid"] is True, res["messages"]
    assert res["version"]                       # e.g. "5.x"
    assert res["epub_version"].startswith("3")


def test_missing_java_is_reported_not_raised(tmp_path, monkeypatch):
    pytest.importorskip("epubcheck")
    import epubcheck.const as const
    monkeypatch.setattr(const, "JAVA", "definitely-not-a-java-binary")
    res = validate_epub(make_epub(tmp_path))
    assert res["available"] is False
    assert "Java" in res["reason"]
