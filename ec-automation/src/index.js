'use strict';

/**
 * EC automation pipeline — entry point.
 *
 * For each configured record (survey 100 and 101), sequentially:
 *   live mode : open form -> combos -> village check -> solve captcha ->
 *               search -> download PDF -> parse -> collect
 *   dry run   : parse the local sample PDF -> collect  (DRY_RUN=1)
 *
 * Writes all extracted details to output/results.json.
 *
 * Usage:
 *   npm start            # live fetch (needs network access to tnreginet.gov.in)
 *   DRY_RUN=1 npm start  # offline: prove the parse->JSON path on the sample PDF
 */

const fs = require('fs');
const path = require('path');
const config = require('./config');
const { parseECFile } = require('./pdfParser');
const { terminate: terminateCaptcha } = require('./captcha');

function ensureDirs() {
  for (const d of [config.OUT_DIR, config.PDF_DIR]) {
    fs.mkdirSync(d, { recursive: true });
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Search one record with a captcha. If the survey has EC records, download +
 * save the PDF and return { pdfPath }. If the search returns no results,
 * return { empty: true } (a valid outcome for survey numbers with no filings).
 */
async function searchAndDownload(client, rec, captcha) {
  console.log(`   searching survey ${rec.surveyNo}...`);
  const html = await client.searchDocYearWise(rec, captcha);
  // "No records" pages have no download link.
  if (!/directPrintDwnLoad/.test(html)) {
    if (/no\s*record|no\s*data|not\s*found|record\s*not/i.test(html)) return { empty: true };
    // No link and no explicit "no records" text -> treat as empty but flag.
    return { empty: true, note: 'no download link on results page' };
  }
  console.log(`   downloading PDF...`);
  const pdf = await client.downloadPdf(rec, captcha);
  const file = path.join(config.PDF_DIR, `${rec.id}.pdf`);
  fs.writeFileSync(file, pdf);
  console.log(`   saved ${pdf.length} bytes -> ${file}`);
  return { pdfPath: file };
}

/** Write the running results to disk so progress survives an interruption. */
function saveResults(results, mode) {
  const output = {
    generatedAt: new Date().toISOString(),
    mode,
    range: { from: config.SURVEY_FROM, to: config.SURVEY_TO },
    count: results.length,
    okCount: results.filter((r) => r.status === 'ok').length,
    emptyCount: results.filter((r) => r.status === 'empty').length,
    failedCount: results.filter((r) => r.status === 'failed').length,
    results,
  };
  fs.writeFileSync(config.RESULT_JSON, JSON.stringify(output, null, 2));
  return output;
}

/**
 * Parse a PDF into a result entry. A survey with no filings yields a stub EC
 * PDF (text "HTML_CONTENT", no header, 0 records) — classify that as 'empty'.
 */
async function toResult(rec, pdfPath) {
  const parsed = await parseECFile(pdfPath);
  const isNil = parsed.recordCount === 0 || !parsed.header.village;
  if (isNil) {
    console.log(`   ${rec.id}: nil — no encumbrance records for this survey`);
    return { id: rec.id, request: rec, status: 'empty', error: null, data: parsed };
  }
  console.log(`   ${rec.id}: parsed ${parsed.recordCount} encumbrance records`);
  return { id: rec.id, request: rec, status: 'ok', error: null, data: parsed };
}

function failResult(rec, err) {
  console.error(`   ${rec.id} FAILED: ${err.message}`);
  return { id: rec.id, request: rec, status: 'failed', error: err.message, data: null };
}

/**
 * LIVE run over all records in ONE shared session.
 *
 * Strategy 'solve-once': solve a single captcha, reuse it for every search
 * (exploits session-flag reuse). If a reused captcha is rejected mid-run, fall
 * back to solving a fresh captcha per remaining search.
 */
async function runLive(records) {
  const { TnreginetClient } = require('./client');

  let client = new TnreginetClient();
  console.log('   opening search form (shared session)...');
  await client.openSearchForm();
  await client.loadCombos(records[0]);
  await client.getVillageDetails(records[0]);

  // Re-establish the session if it goes stale mid-run (long batches expire).
  const reopen = async () => {
    client = new TnreginetClient();
    await client.openSearchForm();
    await client.loadCombos(records[0]);
    await client.getVillageDetails(records[0]);
  };

  const results = [];
  let i = 0;
  for (const rec of records) {
    i += 1;
    console.log(`\n=== [${i}/${records.length}] ${rec.id} (survey ${rec.surveyNo}) ===`);
    try {
      const captcha = await client.solveValidatedCaptcha(config.MAX_CAPTCHA_ATTEMPTS);
      let outcome;
      try {
        outcome = await searchAndDownload(client, rec, captcha);
      } catch (e) {
        // Session likely expired -> reopen once and retry this survey.
        console.log(`   ${e.message}; reopening session and retrying...`);
        await reopen();
        const fresh = await client.solveValidatedCaptcha(config.MAX_CAPTCHA_ATTEMPTS);
        outcome = await searchAndDownload(client, rec, fresh);
      }

      if (outcome.empty) {
        console.log(`   ${rec.id}: no records for this survey${outcome.note ? ` (${outcome.note})` : ''}`);
        results.push({ id: rec.id, request: rec, status: 'empty', error: null, data: null });
      } else {
        results.push(await toResult(rec, outcome.pdfPath));
      }
    } catch (err) {
      results.push(failResult(rec, err));
      // A hard failure may mean a dead session — reopen for the next survey.
      try { await reopen(); } catch { /* next iteration will surface it */ }
    }

    saveResults(results, 'live'); // incremental save after every survey
    if (i < records.length) await sleep(config.REQUEST_DELAY_MS);
  }
  return results;
}

/**
 * DRY run: parse local PDFs — no network. For each record, prefer its already
 * downloaded PDF (output/pdf/<id>.pdf) so both records show their real, distinct
 * data; fall back to the bundled sample PDF if that record hasn't been fetched.
 */
async function runDry(records) {
  const results = [];
  for (const rec of records) {
    console.log(`\n=== ${rec.id} (survey ${rec.surveyNo}) ===`);
    const downloaded = path.join(config.PDF_DIR, `${rec.id}.pdf`);
    const pdfPath = fs.existsSync(downloaded) ? downloaded : config.SAMPLE_PDF;
    console.log(`   DRY_RUN: parsing ${pdfPath === downloaded ? 'downloaded PDF' : 'sample PDF (not yet fetched)'}`);
    try {
      results.push(await toResult(rec, pdfPath));
    } catch (err) {
      results.push(failResult(rec, err));
    }
  }
  return results;
}

async function main() {
  ensureDirs();
  console.log(
    `EC pipeline starting — ${config.RECORDS.length} record(s), ` +
    `${config.DRY_RUN ? 'DRY RUN' : `LIVE (captcha: ${config.CAPTCHA_STRATEGY})`} mode`
  );

  const results = config.DRY_RUN
    ? await runDry(config.RECORDS)
    : await runLive(config.RECORDS);

  const output = saveResults(results, config.DRY_RUN ? 'dry-run' : 'live');
  const totalRecords = results.reduce((n, r) => n + (r.data ? r.data.recordCount : 0), 0);
  console.log(
    `\nWrote ${config.RESULT_JSON}\n` +
    `  ${output.okCount} with records, ${output.emptyCount} empty, ${output.failedCount} failed ` +
    `(of ${output.count})\n` +
    `  ${totalRecords} encumbrance records collected total`
  );

  await terminateCaptcha().catch(() => {});
}

if (require.main === module) {
  main().catch((e) => {
    console.error('Pipeline error:', e);
    process.exit(1);
  });
}

module.exports = { main, runLive, runDry };
