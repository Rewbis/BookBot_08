import os
from datetime import datetime

import ebooklib
import pytest
from ebooklib import epub

from backend.models.schemas import BookProject, Chapter
from backend.utils.manuscript import (
    assemble, chapter_text, companion_text, export_manuscript, paragraphs, slugify, to_markdown, to_text,
)


def chap(n, **kw):
    base = dict(id=f"c{n}", number=n, title=f"Title {n}", intention="", scene_notes="", skeleton="",
                summary="", full_text="", order=n, status="drafted")
    base.update(kw)
    return Chapter(**base)


def project(chapters, **kw):
    now = datetime.now().isoformat()
    fields = dict(id="p", title="The Harbour Ledger", target_word_count=1000, target_chapter_count=3,
                  phase="C", context_elements=[], chapters=chapters, model_name="m", created_at=now, updated_at=now)
    fields.update(kw)
    return BookProject(**fields)


def test_slugify():
    assert slugify("The Harbour Ledger: Part 2!") == "the_harbour_ledger_part_2"
    assert slugify("   ") == "untitled"


def test_chapter_text_prefers_human_edit_then_latest_pass():
    assert chapter_text(chap(1, full_text="edited", polish_draft="polished")) == "edited"
    assert chapter_text(chap(1, polish_draft="polished", enrich_draft="enriched")) == "polished"
    assert chapter_text(chap(1, enrich_draft="enriched", draft_text="draft")) == "enriched"
    assert chapter_text(chap(1, draft_text="  draft  ")) == "draft"
    assert chapter_text(chap(1)) == ""


def test_paragraphs_split_on_blank_lines_and_join_wrapped_lines():
    text = "First line\ncontinues here.\n\n\nSecond para.\n  \nThird."
    assert paragraphs(text) == ["First line continues here.", "Second para.", "Third."]


def test_assemble_orders_skips_and_warns():
    p = project([
        chap(2, full_text="two", approved=True),
        chap(1, full_text="one", phase_c_status="approved"),
        chap(3, full_text="three"),                     # not approved
        chap(4),                                         # empty
    ])
    chapters, warnings = assemble(p)
    assert [c["number"] for c in chapters] == [1, 2]
    assert any("Chapter 3" in w and "not approved" in w for w in warnings)
    assert any("Chapter 4" in w and "no text" in w for w in warnings)

    chapters, warnings = assemble(p, include_unapproved=True)
    assert [c["number"] for c in chapters] == [1, 2, 3]
    assert any("Chapter 3" in w and "included but not approved" in w for w in warnings)
    assert chapters[2]["words"] == 1


def test_markdown_and_text_rendering():
    p = project([chap(1, full_text="Para one.\n\nPara two.", approved=True)], author="A. Writer",
                tagline="Nothing stays buried.", blurb="Line 1\nLine 2")
    chapters, _ = assemble(p)
    meta = {"title": p.title, "author": "A. Writer", "tagline": p.tagline, "blurb": p.blurb}
    md = to_markdown(meta, chapters)
    assert md.startswith("# The Harbour Ledger\n\n*by A. Writer*\n\n**Nothing stays buried.**\n\n> Line 1\n> Line 2\n")
    assert "## Chapter 1: Title 1\n\nPara one.\n\nPara two.\n" in md
    txt = to_text(meta, chapters)
    assert txt.startswith("THE HARBOUR LEDGER\n\nby A. Writer\n")
    assert "CHAPTER 1 — Title 1" in txt


def test_export_epub_writes_valid_book_and_companion(tmp_path):
    p = project([
        chap(1, full_text="Mara <watched> the tide.\n\nIt turned.", approved=True, illustration_prompt="A grey quay at dawn."),
        chap(2, full_text="Later.", approved=True),
    ], author="A. Writer", blurb="Sea, secrets.", cover_prompt="A ledger on wet stone.")
    res = export_manuscript(p, "epub", "", False, str(tmp_path))
    assert res["chapters_included"] == 2 and res["words"] == 7
    assert res["filename"].startswith("the_harbour_ledger_") and res["filename"].endswith(".epub")
    assert os.path.isfile(res["path"])

    book = epub.read_epub(res["path"])
    assert book.get_metadata("DC", "title")[0][0] == "The Harbour Ledger"
    assert book.get_metadata("DC", "creator")[0][0] == "A. Writer"
    assert book.get_metadata("DC", "description")[0][0] == "Sea, secrets."
    docs = [i for i in book.get_items_of_type(ebooklib.ITEM_DOCUMENT) if i.file_name.startswith("chap_")]
    assert [d.file_name for d in docs] == ["chap_001.xhtml", "chap_002.xhtml"]
    content = docs[0].get_content().decode("utf-8")
    assert "Mara &lt;watched&gt; the tide." in content        # escaped, not injected
    assert "<p>It turned.</p>" in content

    companion = open(os.path.join(tmp_path, res["slug"], "export", res["companion"]), encoding="utf-8").read()
    assert "COVER PROMPT:\nA ledger on wet stone." in companion
    assert "Chapter 1: Title 1\n    A grey quay at dawn." in companion
    assert "CHAPTERS: 2   WORDS: 7" in companion


def test_export_md_and_txt_and_errors(tmp_path):
    p = project([chap(1, full_text="Text.", approved=True)])
    for fmt in ("md", "txt"):
        res = export_manuscript(p, fmt, "Someone", False, str(tmp_path))
        assert res["filename"].endswith("." + fmt)
        assert open(res["path"], encoding="utf-8").read().strip()
    with pytest.raises(ValueError):
        export_manuscript(p, "docx", "", False, str(tmp_path))
    with pytest.raises(ValueError):
        export_manuscript(project([chap(1, full_text="x")]), "md", "", False, str(tmp_path))   # nothing approved


def test_companion_respects_illustration_toggles():
    p = project([
        chap(1, full_text="t", approved=True, illustration_prompt="A quay.", illustration_enabled=False),
        chap(2, full_text="t", approved=True, illustration_prompt="A hall."),
    ], cover_prompt="A ledger.", cover_illustration_enabled=False)
    chapters, _ = assemble(p)
    out = companion_text(p, {"title": "T", "author": "", "tagline": "", "blurb": ""}, chapters)
    assert "COVER PROMPT:\n(disabled)" in out
    assert "Chapter 1: Title 1\n    (disabled)" in out
    assert "Chapter 2: Title 2\n    A hall." in out


def test_context_dump_collects_every_artefact(tmp_path):
    from backend.models.schemas import ContextElement, PlantedClue, VoiceProfile, VoiceStage
    from backend.utils.manuscript import context_dump
    now = datetime.now().isoformat()
    p = project(
        [chap(1, full_text="prose", approved=True, intention="open", skeleton="skel", summary="sum",
              critic_output="crit", story_state={"chapter": 1, "open_threads": ["who?"]},
              illustration_prompt="A quay.")],
        creative_dump="dump", role_constraints="rules", premise="prem", premise_summary="psum",
        characters="chars", world_notes="world", style_guide="guide", style_sample="sample",
        plotter_output="plot", antagonist_output="antag", plotter_revision_output="rev",
        continuity_output='{"verdict":"approve"}', author="A", tagline="tag", blurb="blurb", cover_prompt="cover",
        planted_clues=[PlantedClue(id="c", label="Key", description="brass", planted_in="1", pays_off_in="3")],
        voice_profiles=[VoiceProfile(id="v", name="Mara", stages=[VoiceStage(label="all", voice="dry")])],
        context_elements=[ContextElement(id="e", label="Premise", content="prem", element_type="premise", phase="A",
                                         order=0, enabled=False, token_count=3, source="human",
                                         created_at=now, updated_at=now)],
    )
    md = context_dump(p)
    for needle in ["# The Harbour Ledger — context artefacts", "## Creative dump\n\ndump", "## Role & constraints\n\nrules",
                   "## Premise / plot bible\n\nprem", "## Style guide\n\nguide", "## Writing sample\n\nsample",
                   "### Mara", "**all** (ch 1–end)", "dry", "**Key** [active] — brass · planted: 1 · pays off: 3",
                   "## Plotter output\n\nplot", "## Antagonist critique\n\nantag", "## Plotter revision\n\nrev",
                   "## [off] Premise  ·  premise · human · 3 tok", "## Chapter 1: Title 1  ·  approved",
                   "## Skeleton\n\nskel", "## Critic output\n\ncrit", '"open_threads": [\n  "who?"\n ]',
                   "## Illustration prompt\n\nA quay.", "## Cover prompt\n\ncover", "## Blurb\n\nblurb"]:
        assert needle in md, needle

    res = export_manuscript(p, "md", "", False, str(tmp_path))
    ctx_path = os.path.join(tmp_path, res["slug"], "export", res["context_file"])
    assert res["context_file"].endswith("_context.md") and os.path.isfile(ctx_path)


def test_companion_lists_missing_prompts():
    p = project([chap(1, full_text="t", approved=True)])
    chapters, _ = assemble(p)
    out = companion_text(p, {"title": "T", "author": "", "tagline": "", "blurb": ""}, chapters)
    assert "COVER PROMPT:\n(none)" in out
    assert "Chapter 1: Title 1\n    (none)" in out
