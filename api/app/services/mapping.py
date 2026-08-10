import re

from app.services.validation import CANONICAL_FIELDS

# Deterministic first pass. The LLM step improves on this and is measured
# against it, so it is worth having a baseline that is already decent.
ALIASES: dict[str, list[str]] = {
    "full_name": [
        "full_name",
        "name",
        "fullname",
        "customer_name",
        "contact_name",
        "person",
        "first_name",
    ],
    "email": ["email", "email_address", "e_mail", "mail", "email_id"],
    "phone": [
        "phone",
        "phone_number",
        "mobile",
        "mobile_number",
        "contact_number",
        "telephone",
        "tel",
        "cell",
    ],
    "company": [
        "company",
        "company_name",
        "organisation",
        "organization",
        "employer",
        "org",
        "account",
    ],
}


def slug(header: str) -> str:
    """'Email Address ' -> 'email_address', so spacing and case stop mattering."""
    return re.sub(r"[^a-z0-9]+", "_", header.strip().lower()).strip("_")


def guess_mapping(headers: list[str]) -> dict[str, str]:
    """
    {csv column -> canonical field}. Exact alias matches first, then substring,
    so 'Customer Email Address' still resolves. Each canonical field is claimed
    at most once — the first header to match wins.
    """
    mapping: dict[str, str] = {}
    taken: set[str] = set()

    for header in headers:
        s = slug(header)
        for field in CANONICAL_FIELDS:
            if field in taken:
                continue
            if s in ALIASES[field]:
                mapping[header] = field
                taken.add(field)
                break

    for header in headers:
        if header in mapping:
            continue
        s = slug(header)
        for field in CANONICAL_FIELDS:
            if field in taken:
                continue
            if any(alias in s or s in alias for alias in ALIASES[field]):
                mapping[header] = field
                taken.add(field)
                break

    return mapping
