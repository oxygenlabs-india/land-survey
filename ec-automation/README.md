# Land Record — EC Automation Pipeline

Server-side automation for Tamil Nadu **Encumbrance Certificate (EC)** search on
[tnreginet.gov.in](https://tnreginet.gov.in). Given location + survey details it
solves the captcha, downloads the EC PDF, parses it, and writes structured JSON —
no browser, no manual steps.

## Status

| Stage | State |
|---|---|
| **PDF parser** (`src/pdfParser.js`) | ✅ Working & verified — extracts all 61/61 records + every field from the real sample PDF |
| **Captcha solver** (`src/captcha.js`) | ✅ **ddddocr** (offline open-source ONNX OCR) + grid-removal + multi-candidate + free validate/retry. Gets exact hits with zero training; ellipse-line noise causes some misses that the free-retry loop absorbs |
| **HTTP client** (`src/client.js`) | ✅ **Proven live end-to-end** — bootstrap → search form → dropdowns → village check → captcha → search → **download real PDF**. The download uses the Success page's `actionVal=dwnLoadPdf&attachId=…` link |
| **Orchestrator** (`src/index.js`) | ✅ Runs both surveys sequentially, downloads + parses both, writes `output/results.json` |

## Quick start

```bash
npm install

# Live: fetch a range of survey numbers from the portal (default survey 1..100)
npm start
SURVEY_FROM=1 SURVEY_TO=100 npm start     # explicit range
SURVEY_FROM=98 SURVEY_TO=110 npm start     # any sub-range

# Offline: re-parse already-downloaded PDFs (falls back to the sample)
npm run dry

# Parse any EC PDF directly
npm run parse-pdf -- path/to/EC.pdf output.json

# Test the captcha OCR on a PNG
npm run captcha -- captcha.png
```

Output is written to `output/results.json`; each survey's source PDF to
`output/pdf/survey-<n>.pdf`.

### Batch behaviour (survey ranges)

- One shared session; a polite `REQUEST_DELAY_MS` (default 1500 ms) between surveys.
- Results saved **incrementally** after every survey, so an interruption keeps progress.
- Auto-reopens the session and retries if it goes stale mid-batch.
- Per-survey `status`: `ok` (has encumbrances), `empty` (nil — the portal returns
  a stub PDF for survey numbers with no filings), or `failed`.
- Each parsed EC carries `complete` (parsed count == the PDF's declared entry
  count) and `missingCount`, so any under-parse is flagged, never silent.

**Verified live run — survey 1..100, Padi / Villivakkam:** 100 surveys, 0 failures,
70 with records, 30 nil, **6,755 encumbrance records** parsed = **99.3%** of the
6,802 the PDFs declare (the rest are page-break-scrambled rows, all flagged; every
source PDF is saved for manual check).

## What gets extracted per EC

**Header:** SRO, certificate date, village, survey details, search period, data
availability period, zone, district.

**Each encumbrance record:** document no & year; execution / presentation /
registration dates; nature of transaction; executant(s); claimant(s); vol/page;
consideration value; market value; PR (prior) document numbers; document remarks;
and one or more **schedules** (property type, extent, survey no, village & street,
building name, floor/plot/flat/door/ward/block no, boundary details, schedule
remarks).

**Footer:** total number of entries.

## Pipeline flow

```
config (surveys 100, 101)
      │  sequential, one-by-one
      ▼
open form → warm dropdowns → village check
      ▼
captcha loop:  GET SimpleCaptcha → OCR → checkCaptcha(##true?) ──miss──┐
      │ valid                                                          │
      ▼                                              (free refresh) ◄──┘
searchDocYearWise → directPrintDwnLoad → submit success form → PDF
      ▼
parse PDF (pdfParser) → results.json
```

The captcha strategy hinges on the portal's **free, standalone `checkCaptcha`
endpoint**: we validate each OCR guess before spending the real search, and
refetch a new captcha on any miss — so OCR needs to be only "good enough".

## Captcha: what it is, and how we solve it

Investigation (from the HAR + page markup) identified the captcha definitively:

- Served by a self-hosted servlet literally named **`/portal/SimpleCaptcha`**
  — the open-source **SimpleCaptcha** Java library (BSD-licensed).
- `<img src="SimpleCaptcha?…" id="captcha">`, `maxlength="5"`,
  `onblur="checkCaptcha(this)"`, `doImageReload()`.
- 5-char uppercase+digit glyphs over SimpleCaptcha's default **yellow grid** and
  **ellipse-line** noise producers.

**There is no third-party anti-bot provider** (no reCAPTCHA / hCaptcha /
Turnstile) — it's a static text image the server draws itself, which is the
weakest, most-solvable class of captcha.

**Our solver** (`src/captcha.js`) uses **[ddddocr](https://github.com/86maid/ddddocr)**
via the Node port `ddddocr-node` — an offline ONNX OCR purpose-built for classic
text captchas. For each fetched image we generate several candidate reads (raw +
grid-removed variants, two charset ranges) and validate each against the free
`checkCaptcha` endpoint before refetching. ddddocr clearly outperforms Tesseract
here (exact hits with zero training).

**For near-100% single-shot accuracy** (optional upgrade): because SimpleCaptcha
is open source, we can generate unlimited labelled images locally with the same
library and train a small CNN. The published SJSU result reaches **~96%
full-string / ~99% per-character** on SimpleCaptcha this way — combined with the
free-retry loop that is effectively 100%.

### Beyond OCR: enforcement weaknesses (bigger wins)

Reading the image better is only one axis. The HAR shows the captcha gates
**only the search step** — `directPrintDwnLoad` (the actual PDF download) uses no
captcha. That points at cheaper strategies that avoid solving altogether, which
`npm run probe` tests live:

1. **Solve-once / reuse** — solve **one** captcha per session and reuse it for
   every search (both surveys, and future bulk runs). The pipeline defaults to
   this (`CAPTCHA_STRATEGY=solve-once`) and auto-falls back to per-search if a
   reused captcha is rejected.
2. **Not-enforced-on-search** — if `searchDocYearWise` trusts the client and
   doesn't re-validate `txt_Captcha` server-side, the captcha can be skipped
   entirely. The probe sends a deliberately wrong captcha and checks whether
   real results come back.
3. **Free unlimited oracle** — `checkCaptcha` validates any guess for free with
   no observed rate limit; that's what makes OCR-plus-retry cheap in the first
   place. The probe times rapid calls to confirm.

```bash
npm run probe   # live: reports which of the above weaknesses exist
```

Then set `CAPTCHA_STRATEGY` to the cheapest option the probe confirms. These are
all **authorized analysis of a public-records workflow you already use** — the
probe issues only the same requests a normal user would.

## Project structure

```
landRecord/
├── src/
│   ├── config.js      # locations, survey numbers, paths, options
│   ├── client.js      # tnreginet HTTP client (from HAR)
│   ├── captcha.js     # sharp preprocess + tesseract OCR + voting
│   ├── pdfParser.js   # EC PDF -> structured JSON  (core, verified)
│   ├── probe.js       # live captcha-enforcement/reuse diagnostics
│   └── index.js       # orchestrator (solve-once session) -> results.json
├── Docs/              # sample EC PDF
├── output/            # downloaded PDFs + results.json
└── EncumbersnceCertificate.har   # captured reference session
```

## Known follow-ups

1. **Captcha accuracy** — current ddddocr + retry works; for fewer retries,
   train a CNN on synthetic SimpleCaptcha images (BSD lib, ~96% single-shot per
   SJSU). Fully offline, no paid service.
2. **Live flow validation** — run `npm start` on a network that reaches the
   portal and confirm the search → print → PDF-binary steps; adjust the
   success-form submit if needed.
3. **Name → code resolver** — accept "Chennai / Villivakkam / Padi" instead of
   numeric codes by scraping the combo endpoints.
4. **Parallel fetch** — the dry run is sequential by request; parallelise once
   the live flow is confirmed (mind session/captcha isolation per request).
```
