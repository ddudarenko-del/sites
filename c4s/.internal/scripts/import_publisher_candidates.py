#!/usr/bin/env python3
"""Import publisher candidate batches into the C4S dashboard workflow.

Default behavior is safe: read a CSV batch, run duplicate detection, and write an
import plan JSON. The dashboard data file is only modified when --apply is passed.

CSV columns:
- domain (required)
- source_label or source_labels
- niche
- geo                 (pipe/comma/semicolon separated)
- languages           (pipe/comma/semicolon separated)
- placement_types     (pipe/comma/semicolon separated)
- segment
- status
- relationship_stage
- fit_status
- visibility
- deal_model

Examples:
  python3 .internal/scripts/import_publisher_candidates.py \
    --input .internal/batches/wave-01.csv

  python3 .internal/scripts/import_publisher_candidates.py \
    --input .internal/batches/wave-01.csv \
    --output .internal/out/wave-01.plan.json \
    --date 2026-06-10

  python3 .internal/scripts/import_publisher_candidates.py \
    --input .internal/batches/wave-01.csv \
    --apply
"""

from __future__ import annotations

import argparse
import csv
import json
from copy import deepcopy
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DATA_PATH = ROOT / "data" / "publishers.dashboard.json"
DEFAULT_OUTPUT_DIR = ROOT / ".internal" / "out"


def normalize_domain(raw: str) -> str:
    value = (raw or "").strip().lower()
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


def split_multi_value(raw: str | list[str] | None) -> list[str]:
    if raw is None:
        return []
    if isinstance(raw, list):
        values = raw
    else:
        text = str(raw).strip()
        if not text:
            return []
        normalized = text.replace(";", "|").replace(",", "|")
        values = normalized.split("|")
    cleaned: list[str] = []
    for value in values:
        item = str(value).strip()
        if item and item not in cleaned:
            cleaned.append(item)
    return cleaned


def load_dashboard_data(data_path: Path) -> dict:
    return json.loads(data_path.read_text())


def read_candidate_rows(input_path: Path) -> list[dict]:
    with input_path.open(newline="") as handle:
        reader = csv.DictReader(handle)
        return [dict(row) for row in reader]


def build_existing_index(existing_publishers: list[dict]) -> dict[str, list[dict]]:
    index: dict[str, list[dict]] = {}
    for item in existing_publishers:
        domain = normalize_domain(item.get("domain", ""))
        if not domain:
            continue
        index.setdefault(domain, []).append(item)
    return index


def next_id_seed(existing_publishers: list[dict]) -> int:
    highest = 0
    for item in existing_publishers:
        raw_id = str(item.get("id", ""))
        if raw_id.startswith("pub-"):
            try:
                highest = max(highest, int(raw_id.split("-", 1)[1]))
            except ValueError:
                pass
    return highest + 1


def make_record(row: dict, normalized_domain: str, record_id: str, import_date: str) -> dict:
    source_labels = split_multi_value(row.get("source_labels"))
    if not source_labels and row.get("source_label"):
        source_labels = [str(row.get("source_label")).strip()]

    return {
        "id": record_id,
        "domain": normalized_domain,
        "status": (row.get("status") or "prospect").strip() or "prospect",
        "relationship_stage": (row.get("relationship_stage") or "researching").strip() or "researching",
        "fit_status": (row.get("fit_status") or "unverified").strip() or "unverified",
        "deal_model": (row.get("deal_model") or "unknown").strip() or "unknown",
        "placement_types": split_multi_value(row.get("placement_types")) or ["banner"],
        "niche": (row.get("niche") or None) or None,
        "geo": split_multi_value(row.get("geo")),
        "languages": split_multi_value(row.get("languages")),
        "source_labels": source_labels,
        "last_contact": None,
        "next_followup": None,
        "visibility": (row.get("visibility") or "team-safe").strip() or "team-safe",
        "segment": (row.get("segment") or "similar_sites").strip() or "similar_sites",
        "created_at": import_date,
        "updated_at": import_date,
    }


def build_import_plan(rows: list[dict], existing_publishers: list[dict], import_date: str) -> dict:
    existing_index = build_existing_index(existing_publishers)
    next_number = next_id_seed(existing_publishers)
    seen_input: set[str] = set()
    new_records: list[dict] = []
    skipped: list[dict] = []

    for row in rows:
        raw_domain = row.get("domain") or row.get("url") or ""
        normalized = normalize_domain(raw_domain)
        if not normalized:
            skipped.append({
                "domain": raw_domain,
                "normalized_domain": normalized,
                "reason": "empty_domain",
            })
            continue

        if normalized in existing_index:
            skipped.append({
                "domain": raw_domain,
                "normalized_domain": normalized,
                "reason": "tracked_duplicate",
                "matches": [match.get("domain") for match in existing_index[normalized]],
            })
            continue

        if normalized in seen_input:
            skipped.append({
                "domain": raw_domain,
                "normalized_domain": normalized,
                "reason": "input_duplicate",
            })
            continue

        seen_input.add(normalized)
        record_id = f"pub-{next_number:03d}"
        next_number += 1
        new_records.append(make_record(row=row, normalized_domain=normalized, record_id=record_id, import_date=import_date))

    return {
        "summary": {
            "input_rows": len(rows),
            "new_records": len(new_records),
            "skipped": len(skipped),
        },
        "new_records": new_records,
        "skipped": skipped,
    }


def recompute_status_counts(publishers: list[dict]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for item in publishers:
        status = item.get("status") or "unknown"
        counts[status] = counts.get(status, 0) + 1
    return counts


def apply_records(data: dict, new_records: list[dict]) -> dict:
    updated = deepcopy(data)
    updated.setdefault("publishers", [])
    updated.setdefault("meta", {})
    updated["publishers"].extend(new_records)

    previous_count = updated["meta"].get("publisher_count")
    if isinstance(previous_count, int):
        updated["meta"]["publisher_count"] = previous_count + len(new_records)
    else:
        updated["meta"]["publisher_count"] = len(updated["publishers"])

    existing_status_counts = updated["meta"].get("status_counts")
    if isinstance(existing_status_counts, dict):
        status_counts = dict(existing_status_counts)
        for record in new_records:
            status = record.get("status") or "unknown"
            status_counts[status] = status_counts.get(status, 0) + 1
        updated["meta"]["status_counts"] = status_counts
    else:
        updated["meta"]["status_counts"] = recompute_status_counts(updated["publishers"])

    return updated


def default_output_path(input_path: Path) -> Path:
    DEFAULT_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    return DEFAULT_OUTPUT_DIR / f"{input_path.stem}.import-plan.json"


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="CSV file with candidate domains")
    parser.add_argument("--data", default=str(DEFAULT_DATA_PATH), help="Dashboard JSON path")
    parser.add_argument("--output", help="Where to write the import plan JSON")
    parser.add_argument("--date", dest="import_date", default=str(date.today()), help="YYYY-MM-DD for created_at/updated_at")
    parser.add_argument("--apply", action="store_true", help="Append new records into the dashboard JSON")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    input_path = Path(args.input)
    data_path = Path(args.data)
    output_path = Path(args.output) if args.output else default_output_path(input_path)

    data = load_dashboard_data(data_path)
    rows = read_candidate_rows(input_path)
    plan = build_import_plan(rows=rows, existing_publishers=data.get("publishers", []), import_date=args.import_date)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(plan, indent=2, ensure_ascii=False) + "\n")

    if args.apply and plan["new_records"]:
        updated = apply_records(data, plan["new_records"])
        data_path.write_text(json.dumps(updated, indent=2, ensure_ascii=False) + "\n")

    print(f"Input rows: {plan['summary']['input_rows']}")
    print(f"New records: {plan['summary']['new_records']}")
    print(f"Skipped: {plan['summary']['skipped']}")
    print(f"Plan written to: {output_path}")
    if args.apply:
        print(f"Applied to data file: {data_path}")
    else:
        print("Dry run only: dashboard JSON unchanged")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
