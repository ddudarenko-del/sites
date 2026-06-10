# C4S Publisher Research Playbook

## Purpose

Use this playbook to find new publisher prospects for Clips4Sale banner placement without re-finding the same domains or mixing active partners with raw research.

## Working lists

Keep the workflow mentally split into 3 lists:

1. **Active partners**
   - already working with us
   - tracked in `../data/publishers.dashboard.json`
   - usually `status: active`

2. **Research pool**
   - new domains found during search
   - not yet approved for outreach
   - usually `status: prospect`
   - can live in the dashboard as a separate segment such as `similar_sites`

3. **No-fit / duplicate log**
   - domains already screened out
   - domains found again but already present
   - tracked locally in `./no-fit-and-duplicates.md`

## Search workflow

1. Pick a niche keyword cluster.
2. Run 3–10 search variations.
3. Open candidate domains.
4. Check if the site is live and relevant.
5. Run duplicate gate before adding anything.
6. If duplicate: log it in `no-fit-and-duplicates.md` if useful.
7. If new: add it through the intake template.
8. Only after intake is complete, append to the dashboard JSON.

## Keyword banks

### Niche keywords
- giantess
- femdom
- bdsm
- fetish
- domination
- spanking
- tickling
- pegging
- latex
- roleplay

### Commercial / inventory keywords
- advertise
- advertising
- sponsor
- sponsors
- partner
- partners
- banner
- media kit
- traffic
- promo
- contact

### Search patterns
- `"[niche]" advertise`
- `"[niche]" sponsor`
- `"[niche]" banner`
- `"[niche]" partners`
- `"[niche]" contact`
- `site:[domain] advertise`
- `site:[domain] sponsors`
- `site:[domain] banner`
- `inurl:partners "[niche]"`
- `inurl:advertise "[niche]"`
- `intitle:"[niche]" sponsor`

## Candidate fit rules

### Good signs
- niche is relevant to current C4S publisher base
- site is live and loads cleanly
- content looks maintained, not abandoned
- there is visible ad inventory, sponsorship, links, partner pages, or commercial intent
- there is an owner/operator/contact footprint
- domain looks like a standalone publisher rather than low-value junk pages

### Warning signs
- site is very thin or looks auto-generated
- last updates appear very old
- no visible commercial/contact path
- unclear ownership
- content quality is too weak to justify outreach

### No-fit signs
- domain is already in active partners
- domain is already in research pool
- domain is a duplicate after normalization
- domain is dead / parked / broken
- domain is clearly off-niche
- domain is pure junk / scraper / spam

## Duplicate rules

Always compare on normalized root domain.

Normalization rules:
- lowercase everything
- strip `http://` and `https://`
- strip `www.`
- strip paths, params, anchors
- compare canonical hostname only

Treat these as duplicates:
- `https://www.example.com/path`
- `http://example.com`
- `example.com/anything`

If they normalize to the same domain.

## Intake fields for every accepted candidate

Minimum fields:
- `domain`
- `niche`
- `geo`
- `languages`
- `placement_types`
- `source_labels`
- `status`
- `relationship_stage`
- `fit_status`
- `visibility`
- short `why_fit`

Recommended defaults for raw research:
- `status: prospect`
- `relationship_stage: researching`
- `fit_status: unverified`
- `deal_model: unknown`
- `visibility: team-safe`

## Status guide

Use these meanings consistently:

- `active` — already working with us
- `prospect` — found but not yet validated
- `screened` — reviewed manually and looks usable
- `queued` — ready for outreach
- `contacted` — outreach already started
- `no_fit` — screened and rejected
- `duplicate` — already present somewhere in the system

Note: only some of these are currently represented in the dashboard UI. The workflow can still use them before UI changes.

## Source label convention

Keep source labels machine-readable.

Format:
- `google / <query> / YYYY-MM-DD`
- `similar-site research / <batch-name> / YYYY-MM-DD`
- `manual referral / <source> / YYYY-MM-DD`

Examples:
- `google / giantess sponsor / 2026-06-10`
- `google / femdom banner / 2026-06-10`
- `similar-site research / wave-2 / 2026-06-10`

## Add-to-dashboard rule

Do **not** add a domain directly from search results.

Required order:
1. find
2. screen quickly
3. run duplicate gate
4. fill intake template or batch CSV
5. generate import plan
6. apply only reviewed candidates to JSON
7. verify the dashboard still renders correctly

## Batch importer workflow

Template:
- `./batches/candidate-batch-template.csv`

Dry run:
```bash
cd /Users/Hermes/projects/sites
python3 c4s-publisher-dashboard/.internal/scripts/import_publisher_candidates.py \
  --input c4s-publisher-dashboard/.internal/batches/candidate-batch-template.csv
```

Dry run with explicit date/output:
```bash
python3 c4s-publisher-dashboard/.internal/scripts/import_publisher_candidates.py \
  --input c4s-publisher-dashboard/.internal/batches/wave-01.csv \
  --output c4s-publisher-dashboard/.internal/out/wave-01.plan.json \
  --date 2026-06-10
```

Apply reviewed candidates into the dashboard JSON:
```bash
python3 c4s-publisher-dashboard/.internal/scripts/import_publisher_candidates.py \
  --input c4s-publisher-dashboard/.internal/batches/wave-01.csv \
  --date 2026-06-10 \
  --apply
```

## Suggested next upgrades

1. add `why_fit` to structured data
2. add `priority` to structured data
3. add `duplicate_of` for duplicate records when needed
4. add a small importer that converts intake notes into JSON records
5. add a separate local batch file for pending candidates before publication
