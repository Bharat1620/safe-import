import re

CANONICAL_FIELDS = ["full_name", "email", "phone", "company"]
REQUIRED_FIELDS = ["full_name", "email"]

# Deliberately permissive. Strict RFC 5322 rejects addresses that work in
# practice, and this is a data-cleaning tool, not a mail server.
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def normalize_email(value: str) -> str:
    """The dedupe key. Must match what the unique index sees."""
    return value.strip().lower()


def normalize_phone(value: str) -> str:
    """Digits only, then formatted. Anything unrecognised is left untouched."""
    digits = re.sub(r"\D", "", value)
    if len(digits) == 10:
        return f"+91 {digits[:5]} {digits[5:]}"
    if len(digits) == 12 and digits.startswith("91"):
        return f"+91 {digits[2:7]} {digits[7:]}"
    return value.strip()


def validate_row(cells: dict[str, str]) -> dict[str, str]:
    """Field-level errors keyed by column. Empty dict means the row is valid."""
    errors: dict[str, str] = {}

    for field in REQUIRED_FIELDS:
        if not (cells.get(field) or "").strip():
            errors[field] = "Required"

    email = (cells.get("email") or "").strip()
    if email and not EMAIL_RE.match(email):
        errors["email"] = "Not a valid email"

    return errors
