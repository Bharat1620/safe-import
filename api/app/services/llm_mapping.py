import json
import logging

import httpx

from app.config import settings
from app.services.mapping import guess_mapping
from app.services.validation import CANONICAL_FIELDS

log = logging.getLogger(__name__)

ENDPOINT = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    "{model}:generateContent"
)

PROMPT = """You map columns from a customer's CSV onto a fixed contact schema.

Target fields:
- full_name: the person's name
- email: email address
- phone: phone number
- company: employer or organisation

For each source column decide which field it holds, or null if it holds none of
them. A column may only be assigned to one field, and each field may be used at
most once. Judge by the sample values as much as the header — headers are often
abbreviated, misspelled, or in another language.

Give confidence between 0 and 1: how sure you are, not how plausible it looks.

Columns:
{columns}
"""

# Constrains the reply to this shape, so there is no prose to parse and a
# malformed response is the API's problem rather than ours.
SCHEMA = {
    "type": "object",
    "properties": {
        "mappings": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "column": {"type": "string"},
                    "field": {
                        "type": "string",
                        "enum": [*CANONICAL_FIELDS, "none"],
                    },
                    "confidence": {"type": "number"},
                },
                "required": ["column", "field", "confidence"],
            },
        }
    },
    "required": ["mappings"],
}


def describe_columns(headers: list[str], rows: list[dict[str, str]]) -> str:
    """Header plus a few real values — a column called 'Col3' is meaningless
    until you see that it holds email addresses."""
    lines = []
    for header in headers:
        samples = [r.get(header, "") for r in rows[:5] if r.get(header)]
        shown = ", ".join(repr(s) for s in samples[:5]) or "(no values)"
        lines.append(f"- {header!r}: {shown}")
    return "\n".join(lines)


def suggest_mapping(
    headers: list[str], rows: list[dict[str, str]]
) -> list[dict]:
    """
    Returns [{column, field, confidence}] with one entry per header.

    Falls back to the heuristic mapper whenever the model is unavailable,
    rate-limited, or returns something unusable. A mapping step that fails
    closed would block the whole import.
    """
    if not settings.gemini_api_key:
        return _from_heuristic(headers)

    body = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {"text": PROMPT.format(columns=describe_columns(headers, rows))}
                ],
            }
        ],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": SCHEMA,
            "temperature": 0,
        },
    }

    try:
        response = httpx.post(
            ENDPOINT.format(model=settings.gemini_model),
            params={"key": settings.gemini_api_key},
            json=body,
            timeout=20,
        )
        response.raise_for_status()
        text = response.json()["candidates"][0]["content"]["parts"][0]["text"]
        parsed = json.loads(text)["mappings"]
    except Exception as exc:
        log.warning("Column mapping fell back to heuristics: %s", exc)
        return _from_heuristic(headers)

    return _clean(parsed, headers)


def _clean(parsed: list[dict], headers: list[str]) -> list[dict]:
    """
    The model can still return a field twice, or a column that was never sent.
    Highest confidence wins the field; the rest become unmapped.
    """
    by_column = {
        m["column"]: m
        for m in parsed
        if isinstance(m, dict) and m.get("column") in headers
    }

    claimed: dict[str, str] = {}
    for column, m in sorted(
        by_column.items(), key=lambda kv: -float(kv[1].get("confidence") or 0)
    ):
        field = m.get("field")
        if field in CANONICAL_FIELDS and field not in claimed:
            claimed[field] = column

    return [
        {
            "column": header,
            "field": next(
                (f for f, c in claimed.items() if c == header), None
            ),
            "confidence": float(
                by_column.get(header, {}).get("confidence") or 0
            ),
        }
        for header in headers
    ]


def _from_heuristic(headers: list[str]) -> list[dict]:
    mapping = guess_mapping(headers)
    return [
        {"column": h, "field": mapping.get(h), "confidence": 0.0}
        for h in headers
    ]
