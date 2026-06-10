#!/usr/bin/env python3
"""Check candidate domains against the C4S dashboard JSON.

Usage:
  python3 .internal/scripts/check_publisher_duplicates.py giantessclub.com example.org
  python3 .internal/scripts/check_publisher_duplicates.py https://www.example.org/path?x=1
  python3 .internal/scripts/check_publisher_duplicates.py --file /path/to/domains.txt
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
DATA_PATH = ROOT / "data" / "publishers.dashboard.json"


def normalize_domain(raw: str) -> str:
    value = raw.strip().lower()
    if not value:
        return ""
    if "://" not in value:
        value = f"https://{value}"
    parsed = urlparse(value)
    host = parsed.netloc or parsed.path
    host = host.split("@")[ -1 ]
    host = host.split(":")[0]
    if host.startswith("www."):
        host = host[4:]
    return host.strip().strip("/")


def load_publishers() -> list[dict]:
    data = json.loads(DATA_PATH.read_text())
    return data.get("publishers", [])


def build_index(publishers: list[dict]) -> dict[str, list[dict]]:
    index: dict[str, list[dict]] = {}
    for item in publishers:
        domain = normalize_domain(item.get("domain", ""))
        if not domain:
            continue
        index.setdefault(domain, []).append(item)
    return index


def read_file_domains(path: str) -> list[str]:
    lines = Path(path).read_text().splitlines()
    return [line.strip() for line in lines if line.strip() and not line.strip().startswith("#")]


def summarize_match(item: dict) -> str:
    segment = item.get("segment") or "portfolio"
    status = item.get("status") or "unknown"
    stage = item.get("relationship_stage") or "unknown"
    fit = item.get("fit_status") or "unknown"
    return f"segment={segment}, status={status}, stage={stage}, fit={fit}"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("domains", nargs="*", help="Domains or URLs to check")
    parser.add_argument("--file", dest="file_path", help="Text file with one domain/URL per line")
    args = parser.parse_args()

    candidates = list(args.domains)
    if args.file_path:
        candidates.extend(read_file_domains(args.file_path))

    if not candidates:
        parser.error("Provide one or more domains/URLs or use --file")

    publishers = load_publishers()
    index = build_index(publishers)

    seen_input: set[str] = set()
    print(f"Loaded {len(publishers)} tracked publishers from {DATA_PATH}")
    print()

    for raw in candidates:
        normalized = normalize_domain(raw)
        if not normalized:
            print(f"[skip] {raw!r} -> empty after normalization")
            continue

        duplicate_in_input = normalized in seen_input
        seen_input.add(normalized)
        matches = index.get(normalized, [])

        print(f"Candidate: {raw}")
        print(f"Normalized: {normalized}")

        if duplicate_in_input:
            print("Input duplicate: yes")
        else:
            print("Input duplicate: no")

        if matches:
            print(f"Tracked duplicate: yes ({len(matches)} match{'es' if len(matches) != 1 else ''})")
            for match in matches:
                print(f"- {match.get('domain')}: {summarize_match(match)}")
        else:
            print("Tracked duplicate: no")
            print("Result: safe to review as a new candidate")

        print()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
