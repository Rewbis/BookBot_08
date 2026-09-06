"""
Phase D: assemble the approved chapters into a manuscript and write it out.

Formats: epub (ebooklib), md, txt. Files land under projects/<slug>/export/ — book
content never leaves the gitignored projects/ tree. Pure Python, no API keys, so it
is fully unit-tested.
"""
import html
import os
import re
from datetime import datetime

from ebooklib import epub

from backend.models.schemas import BookProject, Chapter

FORMATS = ("epub", "md", "txt")


def slugify(title: str) -> str:
    t = re.sub(r"[^a-z0-9\s-]", "", (title or "").lower())
    t = re.sub(r"[\s-]+", "_", t).strip("_")
    return t or "untitled"


def chapter_text(ch: Chapter) -> str:
    """The chapter as it stands: human-edited full_text first, then the latest agent pass."""
    return (ch.full_text or ch.polish_draft or ch.enrich_draft or ch.draft_text or "").strip()


def is_approved(ch: Chapter) -> bool:
    return bool(ch.approved) or ch.phase_c_status == "approved"


def word_count(text: str) -> int:
    return len(text.split()) if text else 0


def paragraphs(text: str) -> list[str]:
    """Blank-line separated paragraphs; single newlines inside a paragraph become spaces."""
    out = []
    for block in re.split(r"\n\s*\n", text.strip()):
        p = " ".join(line.strip() for line in block.splitlines() if line.strip())
        if p:
            out.append(p)
    return out


def assemble(project: BookProject, include_unapproved: bool = False) -> tuple[list[dict], list[str]]:
    """Ordered chapters ready to export, plus human-readable warnings about what was skipped."""
    chapters, warnings = [], []
    for ch in sorted(project.chapters, key=lambda c: (c.number, c.order)):
        text = chapter_text(ch)
        approved = is_approved(ch)
        if not text:
            warnings.append(f"Chapter {ch.number} ({ch.title}) has no text — skipped")
            continue
        if not approved and not include_unapproved:
            warnings.append(f"Chapter {ch.number} ({ch.title}) is not approved — skipped")
            continue
        if not approved:
            warnings.append(f"Chapter {ch.number} ({ch.title}) included but not approved")
        chapters.append({
            "number": ch.number,
            "title": ch.title or f"Chapter {ch.number}",
            "text": text,
            "approved": approved,
            "words": word_count(text),
        })
    return chapters, warnings


def _meta(project: BookProject, author: str) -> dict:
    return {
        "title": project.title or "Untitled",
        "author": author or project.author or "",
        "tagline": project.tagline or "",
        "blurb": project.blurb or "",
    }


def to_markdown(meta: dict, chapters: list[dict]) -> str:
    out = [f"# {meta['title']}", ""]
    if meta["author"]:
        out += [f"*by {meta['author']}*", ""]
    if meta["tagline"]:
        out += [f"**{meta['tagline']}**", ""]
    if meta["blurb"]:
        out += ["> " + meta["blurb"].replace("\n", "\n> "), ""]
    for c in chapters:
        out += [f"## Chapter {c['number']}: {c['title']}", ""]
        for p in paragraphs(c["text"]):
            out += [p, ""]
    return "\n".join(out).rstrip() + "\n"


def to_text(meta: dict, chapters: list[dict]) -> str:
    out = [meta["title"].upper(), ""]
    if meta["author"]:
        out += [f"by {meta['author']}", ""]
    for c in chapters:
        out += ["", f"CHAPTER {c['number']} — {c['title']}", ""]
        for p in paragraphs(c["text"]):
            out += [p, ""]
    return "\n".join(out).rstrip() + "\n"


def to_epub(meta: dict, chapters: list[dict], path: str) -> None:
    book = epub.EpubBook()
    book.set_identifier(f"bookbot-{slugify(meta['title'])}-{datetime.now().strftime('%Y%m%d%H%M%S')}")
    book.set_title(meta["title"])
    book.set_language("en")
    if meta["author"]:
        book.add_author(meta["author"])
    if meta["blurb"]:
        book.add_metadata("DC", "description", meta["blurb"])

    items = []
    for c in chapters:
        h = epub.EpubHtml(title=f"Chapter {c['number']}: {c['title']}",
                          file_name=f"chap_{c['number']:03d}.xhtml", lang="en")
        body = f"<h1>Chapter {c['number']}</h1><h2>{html.escape(c['title'])}</h2>"
        body += "".join(f"<p>{html.escape(p)}</p>" for p in paragraphs(c["text"]))
        h.content = body
        book.add_item(h)
        items.append(h)

    book.toc = items
    book.add_item(epub.EpubNcx())
    book.add_item(epub.EpubNav())
    book.spine = ["nav"] + items
    epub.write_epub(path, book)


def companion_text(project: BookProject, meta: dict, chapters: list[dict]) -> str:
    """Everything a publisher form or an image tool needs, in one text file next to the export."""
    out = [f"TITLE: {meta['title']}", f"AUTHOR: {meta['author']}", f"TAGLINE: {meta['tagline']}", "",
           "BLURB:", meta["blurb"], "", "COVER PROMPT:", project.cover_prompt or "(none)", ""]
    by_number = {c.number: c for c in project.chapters}
    out.append("ILLUSTRATION PROMPTS:")
    for c in chapters:
        ch = by_number.get(c["number"])
        prompt = (ch.illustration_prompt if ch else "") or "(none)"
        out += [f"  Chapter {c['number']}: {c['title']}", f"    {prompt}"]
    out += ["", f"CHAPTERS: {len(chapters)}   WORDS: {sum(c['words'] for c in chapters)}"]
    return "\n".join(out) + "\n"


def export_manuscript(project: BookProject, fmt: str, author: str, include_unapproved: bool,
                      projects_dir: str) -> dict:
    if fmt not in FORMATS:
        raise ValueError(f"format must be one of {FORMATS}")
    chapters, warnings = assemble(project, include_unapproved)
    if not chapters:
        raise ValueError("No chapters to export — approve at least one chapter with text, or tick 'include unapproved'")

    meta = _meta(project, author)
    slug = slugify(project.title)
    out_dir = os.path.join(projects_dir, slug, "export")
    os.makedirs(out_dir, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M")
    filename = f"{slug}_{stamp}.{fmt}"
    path = os.path.join(out_dir, filename)

    if fmt == "epub":
        to_epub(meta, chapters, path)
    elif fmt == "md":
        with open(path, "w", encoding="utf-8") as f:
            f.write(to_markdown(meta, chapters))
    else:
        with open(path, "w", encoding="utf-8") as f:
            f.write(to_text(meta, chapters))

    companion = f"{slug}_{stamp}_companion.txt"
    with open(os.path.join(out_dir, companion), "w", encoding="utf-8") as f:
        f.write(companion_text(project, meta, chapters))

    return {
        "slug": slug,
        "filename": filename,
        "companion": companion,
        "path": path,
        "format": fmt,
        "chapters_included": len(chapters),
        "words": sum(c["words"] for c in chapters),
        "warnings": warnings,
    }
