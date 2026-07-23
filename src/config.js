'use strict';

/**
 * Configuration for the EC automation pipeline.
 *
 * Location codes come straight from the captured session (the portal uses
 * numeric codes, not names — a future enhancement is a name->code resolver
 * that scrapes loadDistrictCombo / loadSroCombo / loadVillageCombo).
 *
 * For the dry run we fetch two records that differ ONLY by survey number
 * (100 and 101), same district / SRO / village / period.
 */

const BASE_URL = 'https://tnreginet.gov.in/portal';

// Shared location + period for the dry run (from the captured EC search).
const COMMON = {
  zone: '1',
  district: '20003',      // Chennai
  sroId: '20086:1',       // Villivakkam
  sroName: 'Villivakkam',
  villageCode: '949',     // Padi
  periodStart: '08-Jul-2003',
  periodEnd: '01-Jul-2026',
  menuCode: '8400010',
  formId: 'EncumbranceCertificateForm',
};

// Survey-number range to fetch, all in the same area (COMMON). Override with
// env: SURVEY_FROM / SURVEY_TO. Defaults to survey 1..100.
const SURVEY_FROM = parseInt(process.env.SURVEY_FROM || '1', 10);
const SURVEY_TO = parseInt(process.env.SURVEY_TO || '100', 10);

const RECORDS = [];
for (let n = SURVEY_FROM; n <= SURVEY_TO; n++) {
  RECORDS.push({
    id: `survey-${n}`,
    surveyNo: String(n),
    subDivisionNo: '',
    ...COMMON,
  });
}

module.exports = {
  BASE_URL,
  COMMON,
  RECORDS,
  // Where downloaded PDFs and the final JSON go.
  OUT_DIR: 'output',
  PDF_DIR: 'output/pdf',
  RESULT_JSON: 'output/results.json',
  // Captcha solving: how many fetch+OCR+validate attempts before giving up.
  MAX_CAPTCHA_ATTEMPTS: 25,
  // Captcha strategy:
  //   'solve-once'  -> solve ONE captcha per session, reuse for every search
  //                    (fastest; relies on the session-flag reuse weakness).
  //   'per-search'  -> solve+validate a fresh captcha before each search (safe).
  // Live testing proved the captcha is single-use (a reused captcha 403s on the
  // second search), so 'per-search' is the correct default. Solving is fast —
  // it validates on attempt 1-2 every time.
  CAPTCHA_STRATEGY: process.env.CAPTCHA_STRATEGY || 'per-search',
  // Polite delay (ms) between records so we don't hammer the government server.
  REQUEST_DELAY_MS: parseInt(process.env.REQUEST_DELAY_MS || '1500', 10),
  SURVEY_FROM,
  SURVEY_TO,
  // Set DRY_RUN=1 to skip the live portal and parse a local sample PDF instead.
  DRY_RUN: process.env.DRY_RUN === '1',
  // Local sample PDF used in DRY_RUN mode (proves the parse->JSON path offline).
  SAMPLE_PDF: 'Docs/APP_8400001_TXN_565232906_TMPLT_8400004.pdf',
};
