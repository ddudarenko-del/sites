# C4S Internal Research Ops

This folder is for local-only publisher research workflow assets.

Why local-only:
- it contains internal search rules, keyword banks, and screening workflow
- it should not be pushed to the public `sites` repo by default

Current files:
- `publisher-research-playbook.md` — search rules, keyword banks, dedupe rules, fit rules, workflow
- `publisher-intake-template.md` — template for new candidate intake
- `no-fit-and-duplicates.md` — parking lot for screened-out or duplicate domains
- `batches/candidate-batch-template.csv` — CSV template for a batch import
- `scripts/check_publisher_duplicates.py` — duplicate gate against the dashboard JSON
- `scripts/import_publisher_candidates.py` — dry-run batch importer with optional `--apply`
- `tests/test_import_publisher_candidates.py` — local tests for importer behavior

Current source of tracked publishers:
- public data file: `../data/publishers.dashboard.json`

Safe default:
- use these files locally first
- only move them to a private repo or private notes system if you want them shared across machines/users
- importer is dry-run by default and writes a plan JSON; it changes tracked data only with `--apply`

Useful commands:
```bash
cd /Users/Hermes/projects/sites

python3 c4s-publisher-dashboard/.internal/scripts/check_publisher_duplicates.py giantessclub.com newsite.example

python3 c4s-publisher-dashboard/.internal/scripts/import_publisher_candidates.py \
  --input c4s-publisher-dashboard/.internal/batches/candidate-batch-template.csv \
  --date 2026-06-10
```
