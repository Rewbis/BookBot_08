"""
Phase D: assemble the approved chapters into a manuscript and write it out.

Formats: epub (ebooklib), md, txt. Files land under projects/<slug>/export/ — book
content never leaves the gitignored projects/ tree. Pure Python, no API keys, so it
is fully unit-tested.
"""
import html
import json
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
    cover = ("(disabled)" if not project.cover_illustration_enabled
             else project.cover_prompt or "(none)")
    out = [f"TITLE: {meta['title']}", f"AUTHOR: {meta['author']}", f"TAGLINE: {meta['tagline']}", "",
           "BLURB:", meta["blurb"], "", "COVER PROMPT:", cover, ""]
    by_number = {c.number: c for c in project.chapters}
    out.append("ILLUSTRATION PROMPTS:")
    for c in chapters:
        ch = by_number.get(c["number"])
        if ch is not None and not ch.illustration_enabled:
            prompt = "(disabled)"
        else:
            prompt = (ch.illustration_prompt if ch else "") or "(none)"
        out += [f"  Chapter {c['number']}: {c['title']}", f"    {prompt}"]
    out += ["", f"CHAPTERS: {len(chapters)}   WORDS: {sum(c['words'] for c in chapters)}"]
    return "\n".join(out) + "\n"


def _section(title: str, body: str) -> list[str]:
    body = (body or "").strip()
    return [f"## {title}", "", body if body else "_(empty)_", ""]


def context_dump(project: BookProject) -> str:
    """
    Every artefact that shaped the book, in one Markdown file: the slots, style, voices,
    clues, the whole Phase A loop, the context window as sent, and per-chapter plans,
    summaries, story states and prompts. For the record, and for anyone curious how the
    sausage was made.
    """
    out = [f"# {project.title or 'Untitled'} — context artefacts", "",
           f"_Exported {datetime.now().strftime('%Y-%m-%d %H:%M')} · model {project.model_name} · "
           f"target {project.target_word_count:,} words / {project.target_chapter_count} chapters_", ""]

    out += ["# Phase A — inputs", ""]
    out += _section("Creative dump", project.creative_dump)
    out += _section("Role & constraints", project.role_constraints)
    out += _section("Premise / plot bible", project.premise)
    out += _section("Premise summary", project.premise_summary)
    out += _section("Characters", project.characters)
    out += _section("World notes", project.world_notes)
    out += _section("Style guide", project.style_guide)
    out += _section("Writing sample", project.style_sample)

    out += ["## Character voices", ""]
    if project.voice_profiles:
        for vp in project.voice_profiles:
            out += [f"### {vp.name or 'Unnamed'}", ""]
            for s in vp.stages:
                rng = f"ch {s.from_chapter}–{s.to_chapter if s.to_chapter else 'end'}"
                out += [f"**{s.label}** ({rng})", "", (s.voice or "").strip() or "_(empty)_", ""]
    else:
        out += ["_(none)_", ""]

    out += ["## Planted clues", ""]
    if project.planted_clues:
        for c in project.planted_clues:
            out += [f"- **{c.label or '(unnamed)'}** [{c.status}] — {c.description}"
                    + (f" · planted: {c.planted_in}" if c.planted_in else "")
                    + (f" · pays off: {c.pays_off_in}" if c.pays_off_in else "")]
        out.append("")
    else:
        out += ["_(none)_", ""]

    out += ["# Phase A — plot loop", ""]
    out += _section("Plotter output", project.plotter_output)
    out += _section("Antagonist critique", project.antagonist_output)
    out += _section("Plotter revision", project.plotter_revision_output)
    out += _section("Continuity report (plan level)", project.continuity_output)

    out += ["# Context window (as last saved)", ""]
    if project.context_elements:
        for el in sorted(project.context_elements, key=lambda e: e.order):
            flag = "on" if el.enabled else "off"
            comp = " · compressed" if el.compressed else ""
            out += [f"## [{flag}] {el.label}  ·  {el.element_type} · {el.source} · {el.token_count} tok{comp}", "",
                    (el.content or "").strip() or "_(empty)_", ""]
    else:
        out += ["_(none)_", ""]

    out += ["# Chapters", ""]
    for ch in sorted(project.chapters, key=lambda c: (c.number, c.order)):
        out += [f"## Chapter {ch.number}: {ch.title}  ·  {'approved' if is_approved(ch) else ch.phase_c_status or ch.status}", ""]
        out += _section("Intention", ch.intention)
        out += _section("Scene notes", ch.scene_notes)
        out += _section("Skeleton", ch.skeleton)
        out += _section("Summary", ch.summary)
        out += _section("Enrich-pass summary", ch.enrich_draft_summary)
        out += _section("Critic output", ch.critic_output)
        out += _section("Continuity report", ch.continuity_report)
        if ch.story_state:
            out += ["### Story state (end of chapter)", "", "```json",
                    json.dumps(ch.story_state, indent=1, ensure_ascii=False), "```", ""]
        illo = ("(disabled)" if not ch.illustration_enabled else ch.illustration_prompt)
        out += _section("Illustration prompt", illo)

    out += ["# Phase D", ""]
    out += _section("Author", project.author)
    out += _section("Tagline", project.tagline)
    out += _section("Blurb", project.blurb)
    out += _section("Cover prompt", "(disabled)" if not project.cover_illustration_enabled else project.cover_prompt)
    return "\n".join(out).rstrip() + "\n"


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

    context_file = f"{slug}_{stamp}_context.md"
    with open(os.path.join(out_dir, context_file), "w", encoding="utf-8") as f:
        f.write(context_dump(project))

    return {
        "slug": slug,
        "filename": filename,
        "companion": companion,
        "context_file": context_file,
        "path": path,
        "format": fmt,
        "chapters_included": len(chapters),
        "words": sum(c["words"] for c in chapters),
        "warnings": warnings,
    }
