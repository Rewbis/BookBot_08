"""
EPUB validation via the `epubcheck` package (a thin wrapper around the official
Java tool). Degrades gracefully: if the package or a Java runtime is missing, the
result says so instead of raising, so the export flow never breaks on it.
"""
import json
import os


def validate_epub(path: str) -> dict:
    if not os.path.isfile(path):
        return {"available": False, "reason": "file not found"}
    try:
        from epubcheck import EpubCheck
    except ImportError:
        return {"available": False, "reason": "epubcheck is not installed (pip install epubcheck)"}

    try:
        result = EpubCheck(path)
    except FileNotFoundError:
        return {"available": False, "reason": "Java runtime not found on PATH — epubcheck needs Java 11+"}
    except (json.JSONDecodeError, KeyError, ValueError) as e:
        return {"available": False, "reason": f"epubcheck produced no readable output (is Java installed?): {e}"}
    except Exception as e:  # noqa: BLE001 — anything else is still "couldn't validate", not a crash
        return {"available": False, "reason": f"epubcheck failed: {e}"}

    checker = result.checker
    messages = [
        {"level": m.level, "id": m.id, "location": m.location, "message": m.message, "suggestion": m.suggestion}
        for m in (result.messages or [])
    ]
    return {
        "available": True,
        "valid": bool(result.valid),
        "version": getattr(checker, "checkerVersion", ""),
        "fatal": int(getattr(checker, "nFatal", 0) or 0),
        "errors": int(getattr(checker, "nError", 0) or 0),
        "warnings": int(getattr(checker, "nWarning", 0) or 0),
        "epub_version": getattr(result.meta, "ePubVersion", ""),
        "messages": messages,
    }
