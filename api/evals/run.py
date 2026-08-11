"""
Scores column mapping against known-correct answers.

    uv run python -m evals.run            # the LLM path
    uv run python -m evals.run heuristic  # the deterministic baseline

Exact match per column, no LLM-as-judge — the correct answer is known, so
anything fuzzier would only hide regressions. Run before and after every prompt
change and record the delta.
"""

import json
import pathlib
import sys

from app.services.llm_mapping import suggest_mapping, _from_heuristic

CASES = json.loads((pathlib.Path(__file__).parent / "cases.json").read_text())


def rows_from(columns: dict[str, list[str]]) -> list[dict[str, str]]:
    depth = max(len(v) for v in columns.values())
    return [
        {k: (v[i] if i < len(v) else "") for k, v in columns.items()}
        for i in range(depth)
    ]


def main() -> None:
    heuristic = len(sys.argv) > 1 and sys.argv[1] == "heuristic"

    total = correct = 0
    # Confidence buckets, to check the model is right as often as it claims.
    buckets: dict[str, list[bool]] = {"high": [], "low": []}

    for case in CASES:
        headers = list(case["columns"])
        rows = rows_from(case["columns"])
        result = (
            _from_heuristic(headers)
            if heuristic
            else suggest_mapping(headers, rows)
        )
        got = {m["column"]: m["field"] for m in result}
        confidence = {m["column"]: m["confidence"] for m in result}

        misses = []
        for column, want in case["expected"].items():
            total += 1
            hit = got.get(column) == want
            correct += hit
            if not heuristic:
                buckets["high" if confidence.get(column, 0) >= 0.9 else "low"].append(hit)
            if not hit:
                misses.append(f"{column!r}: got {got.get(column)!r}, want {want!r}")

        mark = "ok  " if not misses else "FAIL"
        print(f"{mark} {case['name']}")
        for miss in misses:
            print(f"       {miss}")

    print(f"\n{correct}/{total} columns correct ({correct / total:.0%})")

    if not heuristic:
        for name, hits in buckets.items():
            if hits:
                print(
                    f"  claimed {name} confidence: right {sum(hits)}/{len(hits)} "
                    f"({sum(hits) / len(hits):.0%})"
                )


if __name__ == "__main__":
    main()
