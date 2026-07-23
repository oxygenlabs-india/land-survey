'use strict';

/**
 * Captcha bypass PROBE — live diagnostic (run against the portal).
 *
 * This is authorized analysis of a workflow the operator already uses to fetch
 * public land records. It does NOT attack the server: it issues the same
 * requests a normal user would, and observes which captcha weaknesses exist so
 * the pipeline can pick the cheapest correct strategy.
 *
 * Tests, in order:
 *   1. Enforcement — is the captcha actually checked on searchDocYearWise, or
 *      is checkCaptcha purely cosmetic? (search with a WRONG captcha)
 *   2. Reuse — after one validated captcha, can multiple searches run in the
 *      same session without re-solving? (solve once, search twice)
 *   3. Oracle — does checkCaptcha rate-limit? (rapid repeated calls)
 *
 * Usage: node src/probe.js
 */

const { TnreginetClient } = require('./client');
const { RECORDS, MAX_CAPTCHA_ATTEMPTS } = require('./config');

async function setup() {
  const client = new TnreginetClient();
  await client.openSearchForm();
  await client.loadCombos(RECORDS[0]);
  await client.getVillageDetails(RECORDS[0]);
  return client;
}

async function testEnforcement() {
  console.log('\n[1] ENFORCEMENT — search with a WRONG captcha (no checkCaptcha first)');
  const client = await setup();
  try {
    const res = await client.probeCaptchaEnforcement(RECORDS[0]);
    console.log(`    -> enforced: ${res.enforced}`);
    console.log(`    -> ${res.note}`);
    if (!res.enforced) {
      console.log('    ** BYPASS: captcha not enforced on search — skip solving entirely. **');
    }
  } catch (e) {
    console.log(`    probe error: ${e.message}`);
  }
}

async function testReuse() {
  console.log('\n[2] REUSE — solve one captcha, run TWO searches in one session');
  const client = await setup();
  try {
    const captcha = await client.solveValidatedCaptcha(MAX_CAPTCHA_ATTEMPTS);
    console.log(`    solved: "${captcha}"`);
    const h1 = await client.searchDocYearWise(RECORDS[0], captcha);
    const ok1 = /directPrintDwnLoad/.test(h1) && h1.length > 20000;
    console.log(`    search #1 (survey ${RECORDS[0].surveyNo}): ${ok1 ? 'results' : 'no results'}`);
    // second search WITHOUT re-solving
    const h2 = await client.searchDocYearWise(RECORDS[1] || RECORDS[0], captcha);
    const ok2 = /directPrintDwnLoad/.test(h2) && h2.length > 20000;
    console.log(`    search #2 (survey ${(RECORDS[1] || RECORDS[0]).surveyNo}, reused captcha): ${ok2 ? 'results' : 'no results'}`);
    if (ok1 && ok2) {
      console.log('    ** REUSE WORKS: solve once per session, search many. **');
    } else if (ok1 && !ok2) {
      console.log('    reuse rejected — captcha is single-use; solve per search.');
    }
  } catch (e) {
    console.log(`    probe error: ${e.message}`);
  }
}

async function testOracleRate() {
  console.log('\n[3] ORACLE — 10 rapid checkCaptcha calls (rate-limit check)');
  const client = await setup();
  try {
    const t0 = Date.now();
    let rejected = 0;
    for (let i = 0; i < 10; i++) {
      const ok = await client.checkCaptcha('ZZZZZ');
      if (!ok) rejected++;
    }
    const ms = Date.now() - t0;
    console.log(`    10 calls in ${ms}ms (${(ms / 10).toFixed(0)}ms avg), ${rejected}/10 rejected`);
    console.log(rejected === 10
      ? '    no false-accepts; endpoint usable as a free unlimited validator (our core lever).'
      : '    unexpected accepts — investigate.');
  } catch (e) {
    console.log(`    probe error: ${e.message}`);
  }
}

async function main() {
  console.log('Captcha bypass probe — tnreginet EC flow');
  console.log('(needs network access to tnreginet.gov.in)');
  await testEnforcement();
  await testReuse();
  await testOracleRate();
  console.log('\nDone. Pick the cheapest strategy the results allow:');
  console.log('  enforced=false      -> set CAPTCHA_STRATEGY and skip solving (edit client to send any captcha)');
  console.log('  reuse works         -> CAPTCHA_STRATEGY=solve-once (default)');
  console.log('  single-use captcha  -> CAPTCHA_STRATEGY=per-search');
}

if (require.main === module) {
  main().catch((e) => { console.error('probe failed:', e.message); process.exit(1); });
}

module.exports = { testEnforcement, testReuse, testOracleRate };
