# land-survey

Tamil Nadu land & survey data tooling. Two independent toolsets live here, each
self-contained in its own subfolder with its own `package.json` and README:

| Folder | What it does | Data source |
|---|---|---|
| [`ec-automation/`](ec-automation/) | Automates **Encumbrance Certificate (EC)** search on tnreginet.gov.in — solves the captcha, downloads the EC PDF, parses it to structured JSON. | tnreginet.gov.in registration portal |
| [`survey-numbers/`](survey-numbers/) | Extracts **public cadastral survey numbers** and parcel boundaries from the open TNGIS map services (CSV/XLSX/GeoJSON). | Open TNGIS (Tamil Nilam GIS) WFS |

The two are deliberately separate: `ec-automation` touches the registration
portal (captcha-gated, per-record), while `survey-numbers` uses only open,
unauthenticated cadastral GIS data. See each subfolder's README for setup and usage.

## Getting started

Each toolset is installed and run independently from its own folder:

```bash
cd ec-automation && npm install     # see ec-automation/README.md
cd survey-numbers && npm install    # see survey-numbers/README.md
```
