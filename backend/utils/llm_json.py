import json
import re


def parse_json_response(raw: str) -> dict:
    """
    Parse a JSON object from LLM output.

    Models are told to return bare JSON, but frequently wrap it in ```json fences
    anyway. Strip a leading fence (with or without a language tag) and a trailing
    fence, then parse. Raises json.JSONDecodeError if what remains is not JSON.
    """
    cleaned = raw.strip()
    cleaned = re.sub(r'^```(?:json)?\s*', '', cleaned)
    cleaned = re.sub(r'\s*```$', '', cleaned).strip()
    return json.loads(cleaned)
