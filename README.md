# survey-number-automation

Extract **public cadastral survey numbers** and parcel boundaries for Tamil Nadu from the
open TNGIS (Tamil Nilam GIS) map services. Uses only publicly served, open government
**cadastral** data — survey numbers and parcel geometry. It does **not** access, scrape,
or store any personal, ownership, financial, or registration records.

## What it does

- Enumerates survey numbers for any district / taluk / revenue village via the open
  TNGIS `generic_api` and GeoServer **WFS** parcel layer (`cadastral_analysis:fmb_ulpin`).
- Exports results to CSV / XLSX.

## Data source

- **TNGIS GI Viewer** — https://tngis.tn.gov.in/apps/gi_viewer/
- Open WFS endpoint: `https://tngis.tn.gov.in/app/ows`
- Parcel layer: `cadastral_analysis:fmb_ulpin` (survey_number, sub_division, admin codes, geometry)

All endpoints used here are the same public, unauthenticated services the official viewer
calls to draw the map. Only a `Referer` header (and `X-APP-NAME: demo` for the dropdown API)
is required.

## Usage

```bash
npm install          # (no runtime deps; Node 18+ has global fetch)

# 1. Extract every survey number in a locality (Anna Nagar East revenue villages) -> xlsx
node scripts/extract-anna-nagar-east.mjs AnnaNagarEast_SurveyNumbers.xlsx

# 2. Extract all covered villages/blocks in Chennai district -> csv
node scripts/extract-chennai-district.mjs chennai_survey_numbers.csv

# 3. Extract every village in a taluk, one xlsx per village + index
node scripts/extract-taluk-villages.mjs ./out

# 4. Generate parcel BOUNDARIES per survey number (GeoJSON) for a village
#    args: <village_code> <village_name> <output_dir>
node scripts/generate-boundaries.mjs 006 Naduvakkarai ./out
```

### Scripts

| Script | Output |
|---|---|
| `extract-anna-nagar-east.mjs` | One locality -> two-sheet xlsx (survey numbers + all plots) |
| `extract-chennai-district.mjs` | Whole district -> csv |
| `extract-taluk-villages.mjs` | Every village in a taluk -> separate xlsx each + index |
| `generate-boundaries.mjs` | One GeoJSON boundary file per survey number (opens in QGIS / Google Earth) |

## Scope & ethics

This project is limited to **open cadastral survey data**. It deliberately excludes anything
that touches personal or protected records — no Encumbrance Certificates, no patta/owner
lookups, no registration data, and nothing behind a CAPTCHA, login, or OTP. Please keep it
that way.

## License

Internal / open data tooling. Respect the TNGIS terms of use and applicable data-protection law.
