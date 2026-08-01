# land-survey

Tamil Nadu land & survey data tooling. Two independent toolsets live here, each
self-contained in its own subfolder with its own `package.json` and README:

| Folder | What it does | Data source |
|---|---|---|
| [`ec-automation/`](ec-automation/) | Automates **Encumbrance Certificate (EC)** search on tnreginet.gov.in — solves the captcha, downloads the EC PDF, parses it to structured JSON. | tnreginet.gov.in registration portal |
| [`survey-numbers/`](survey-numbers/) | Extracts **public cadastral survey numbers** and parcel boundaries from the open TNGIS map services (CSV / XLSX / GeoJSON). | Open TNGIS (Tamil Nilam GIS) WFS |

The two are deliberately separate: `ec-automation` touches the registration
portal (captcha-gated, per-record), while `survey-numbers` uses only open,
unauthenticated cadastral GIS data. See each subfolder's README for the full
details, options, and verified results.

## Product direction

These extractors are the data foundation of a larger product: a single,
parcel-centric map of Tamil Nadu land, assembled from scattered government
records and given to citizens for free.

- **[docs/ROADMAP.md](docs/ROADMAP.md)** — phase-wise plan and the current focus.
  **We are in Phase 1 (Connectivity & Access).** Read this before building.
- **[docs/GO-TO-MARKET.md](docs/GO-TO-MARKET.md)** — positioning, users, business
  model, and the privacy constraints.

## Repository layout

```
land-survey/
├── README.md               # you are here
├── package.json            # root entry point — delegates to the two subprojects
├── .gitignore
├── ec-automation/          # EC automation (Node, CommonJS)
│   ├── src/                # config, HTTP client, captcha solver, PDF parser, orchestrator
│   ├── package.json
│   └── README.md
└── survey-numbers/         # cadastral survey-number extractor (Node, ESM)
    ├── scripts/            # per-locality / per-taluk extractors + boundary generator
    ├── package.json
    └── README.md
```

## Getting started

Requires **Node 18+**. Each toolset is installed and run independently, or via the
root scripts below.

```bash
# Install dependencies for both subprojects
npm run install:all
# (equivalent to: cd ec-automation && npm install ; cd survey-numbers && npm install)
```

### Run from the repo root

```bash
# EC automation (Padi / Villivakkam by default; override the survey range with env)
npm run ec                                  # live run
SURVEY_FROM=1 SURVEY_TO=10 npm run ec        # a specific survey range
npm run ec:dry                              # offline: re-parse a local sample PDF
npm run ec:probe                            # live captcha-enforcement diagnostics

# Survey-number extraction (open cadastral data)
npm run survey:anna-nagar-east              # one locality  -> xlsx + csv
npm run survey:chennai                      # whole district -> csv
npm run survey:taluk                        # every village in a taluk -> ./out
```

Or work inside a subfolder directly (`cd ec-automation` / `cd survey-numbers`) — each
folder's README documents its own scripts and options.

## Licensing

The two subprojects carry their own license fields (`ec-automation` — ISC,
`survey-numbers` — MIT). Align them if you want a single repo-wide license.
