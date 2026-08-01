'use strict';

/**
 * HTTP client for the tnreginet.gov.in Encumbrance Certificate flow.
 *
 * Replays the exact request sequence captured in the HAR, server-side only
 * (no browser). Maintains one cookie jar (PORTALJSESSIONID) across the flow and
 * carries the _csrf token.
 *
 * Flow:
 *   1. openEncumbranceCertSearch  -> load the search form (gets session + csrf)
 *   2. loadDistrictCombo / loadSroCombo / loadVillageCombo  -> warm the dropdowns
 *   3. getVillageDetails          -> validate the village/period
 *   4. captcha loop: GET SimpleCaptcha -> OCR -> checkCaptcha (##true?) -> retry
 *   5. searchDocYearWise          -> results HTML (+ directPrintDwnLoad link)
 *   6. directPrintDwnLoad         -> "Success page" form
 *   7. submit success form        -> PDF binary
 *
 * NOTE: steps 5-7 (and the exact success-form fields) could not be exercised
 * from the dev sandbox against the live portal; they are implemented from the
 * captured HAR and must be validated on a network that can reach the portal.
 */

const axios = require('axios');
const { CookieJar } = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');
const { candidates: captchaCandidates } = require('./captcha');
const { BASE_URL } = require('./config');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:153.0) Gecko/20100101 Firefox/153.0';

class TnreginetClient {
  constructor() {
    this.jar = new CookieJar();
    this.http = wrapper(
      axios.create({
        baseURL: BASE_URL,
        jar: this.jar,
        withCredentials: true,
        timeout: 30000,
        maxRedirects: 5,
        headers: {
          'User-Agent': UA,
          'Accept-Language': 'en-US,en;q=0.9',
          Origin: 'https://tnreginet.gov.in',
          Referer: `${BASE_URL}/webHP?requestType=ApplicationRH&actionVal=homePage&screenId=114&UserLocaleID=en`,
        },
      })
    );
    this.csrf = null;
    this.authToken = null;
  }

  /** POST helper for the AJAX-style webHP endpoints (x-www-form-urlencoded). */
  async postWeb(params, body = {}) {
    const qs = new URLSearchParams({ requestType: 'ApplicationRH', ...params });
    const data = new URLSearchParams(body).toString();
    const res = await this.http.post(`/webHP?${qs.toString()}`, data, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        Accept: 'text/html, */*; q=0.01',
      },
    });
    return res;
  }

  /**
   * Step 0: bootstrap a session. GET the homepage to obtain the
   * PORTALJSESSIONID cookie and the CSRF token (exposed in a
   * <meta name="_csrf" content="..."> tag). Without this the AJAX POSTs 403.
   */
  async bootstrap() {
    const res = await this.http.get(
      '/webHP?requestType=ApplicationRH&actionVal=homePage&screenId=114&UserLocaleID=en',
      { headers: { Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' } }
    );
    const html = String(res.data || '');
    const m =
      html.match(/<meta\s+name=["']_csrf["']\s+content=["']([\w-]+)["']/i) ||
      html.match(/name=["']_csrf["'][^>]*value=["']([\w-]+)["']/i);
    if (m) this.csrf = m[1];
    if (!this.csrf) throw new Error('could not obtain CSRF token from homepage');
    return this.csrf;
  }

  /** Step 1: open the search form; capture session cookie + csrf token. */
  async openSearchForm() {
    if (!this.csrf) await this.bootstrap();
    const res = await this.postWeb(
      {
        actionVal: 'openEncumbranceCertSearch',
        screenId: '8400001',
        scenarioId: '2',
        menuCode: '8400010',
        auditUSFlag: 'true',
      },
      { portal: 'CAS', _csrf: this.csrf }
    );
    const html = String(res.data || '');
    // Capture the ENTIRE form's hidden inputs as the base body for search and
    // download — the portal re-serializes this whole form (60+ fields incl.
    // alert-message and jsonString/VILLAGE_SELECTION fields). Merging over this
    // base avoids hand-maintaining every field.
    this.baseFields = allInputs(html);
    const auth = html.match(/name=["']authToken["'][^>]*value=["']([\w]+)["']/i) ||
                 html.match(/value=["']([\w]+)["'][^>]*name=["']authToken["']/i);
    if (auth) this.authToken = auth[1];
    return { csrf: this.csrf, authToken: this.authToken };
  }

  /** Step 2: warm the cascading dropdowns (district -> sro -> village). */
  async loadCombos(rec) {
    await this.postWeb({ actionVal: 'loadDistrictCombo', queryType: 'Select', screenId: '8400001', comboValue: rec.zone, _csrf: this.csrf });
    await this.postWeb({ actionVal: 'loadSroCombo', queryType: 'Select', screenId: '8400001', comboValue: rec.district, _csrf: this.csrf });
    await this.postWeb({ actionVal: 'loadVillageCombo', queryType: 'Select', screenId: '8400001', comboValue: rec.sroId, _csrf: this.csrf });
  }

  /** Step 3: validate village + period. Returns the availability message. */
  async getVillageDetails(rec) {
    const res = await this.postWeb({
      actionVal: 'getVillageDetails', screenId: '8400001',
      villageList: rec.villageCode, sroId: rec.sroId,
      usrStartDt: rec.periodStart, usrEndDt: rec.periodEnd,
      isRevenueVillage: 'false', surveyNumber: rec.surveyNo || '0',
      subDivisionNumber: rec.subDivisionNo || '0', _csrf: this.csrf,
    });
    return String(res.data || '');
  }

  /** Fetch a fresh captcha PNG as a Buffer. */
  async fetchCaptcha() {
    const res = await this.http.get(`/SimpleCaptcha?${Date.now()}`, {
      responseType: 'arraybuffer',
      headers: { Accept: 'image/avif,image/webp,image/png,image/*;q=0.8,*/*;q=0.5' },
    });
    return Buffer.from(res.data);
  }

  /** Validate a captcha guess against the portal. Returns true on ##true. */
  async checkCaptcha(value) {
    const res = await this.postWeb(
      { actionVal: 'checkCaptcha', queryType: 'Select', screenId: '114', captcha_val: value },
      { _csrf: this.csrf }
    );
    return /##\s*true/i.test(String(res.data || ''));
  }

  /**
   * Step 4: fetch a captcha, OCR it into several candidate reads, and validate
   * each 5-char candidate against the free checkCaptcha endpoint. On a full
   * miss, refetch a NEW captcha (refresh is free) and repeat. Returns the
   * validated captcha string.
   */
  async solveValidatedCaptcha(maxAttempts) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const png = await this.fetchCaptcha();
      const cands = (await captchaCandidates(png)).filter((c) => c.length === 5);
      for (const guess of cands) {
        const ok = await this.checkCaptcha(guess);
        console.log(`   captcha attempt ${attempt}: "${guess}" -> ${ok ? 'VALID' : 'reject'}`);
        if (ok) return guess;
      }
      if (cands.length === 0) {
        console.log(`   captcha attempt ${attempt}: no 5-char candidate, refetching`);
      }
    }
    throw new Error(`captcha not solved within ${maxAttempts} attempts`);
  }

  /**
   * PROBE: does searchDocYearWise actually enforce the captcha server-side?
   * Runs a search WITHOUT solving any captcha, sending a deliberately wrong
   * value. If the response looks like real results (has the download link and
   * no captcha error), the captcha is not enforced on search — a full bypass.
   * Returns { enforced: boolean, note: string }.
   */
  async probeCaptchaEnforcement(rec) {
    const html = await this.searchDocYearWise(rec, 'ZZZZZ');
    const looksLikeResults = /directPrintDwnLoad/.test(html) && html.length > 20000;
    const captchaError = /(invalid|incorrect|wrong)\s*captcha|captcha.*(invalid|incorrect|required)/i.test(html);
    const enforced = captchaError || !looksLikeResults;
    return {
      enforced,
      note: enforced
        ? 'search appears to require a valid captcha'
        : 'search returned results with a WRONG captcha — not enforced (bypass)',
    };
  }

  /**
   * The EncumbranceCertificateForm field set, shared by the search and the
   * download (print) steps — the portal re-serializes the same form and only
   * swaps actionVal/screenId.
   */
  formBody(rec, captcha) {
    return {
      ...(this.baseFields || {}),        // all 60 form fields as the base
      requestType: 'ApplicationRH', menuCode: rec.menuCode, formId: rec.formId,
      isRevenueVillage: 'false', showDateFlag: 'true', showBookFlag: 'false',
      divId: 'propertyDetailSection', applyOnline: 'false', isPlotFlatWise: 'false',
      DOC_SEARCH: '1', closed_office_flag: '-1', loggedInGuest: 'true',
      authToken: this.authToken || '', srvrDate: todayDDMMYYYY(),
      multiVillageLimitEC: rec.multiVillageLimitEC || '3', validVillage: '1',
      hdnZone: rec.zone, hdnDistrict: rec.district, hdnSroName: rec.sroId,
      sroName: rec.sroName, txt_PeriodStartDt: rec.periodStart,
      txt_PeriodEndDt: rec.periodEnd, cmb_Village: '-1',
      multi_cmb_Village: rec.villageCode, multi_SurveyNo: rec.surveyNo,
      multi_SubDivisionNo: rec.subDivisionNo || '', txt_SurveyNo: '',
      txt_SubDivisionNo: '', txt_Captcha: captcha || '', countNoRecords: '0',
      _csrf: this.csrf,
    };
  }

  /** Step 5: run the year-wise search. Returns results HTML. */
  async searchDocYearWise(rec, captcha) {
    const res = await this.postWeb(
      { actionVal: 'searchDocYearWise', screenId: '8400001', divId: 'searchComponentSection', isPlotFlatWise: 'false', _csrf: this.csrf },
      this.formBody(rec, captcha)
    );
    const html = String(res.data || '');
    // Capture the print/download context the results page populates. The
    // results page RESETS several location fields to print values (hdnDistrict,
    // hdnSroName, sroName, closed_office_flag, hdnZone) that differ from the
    // search values — the download must use THESE, plus appTransId (the
    // transaction id identifying this result's PDF).
    this.printCtx = pickHidden(html, [
      'appTransId', 'docCreateAppId', 'landDocIndexId', 'templateIds', 'tmpltMstID',
      'isECValid', 'previewFlagFrmCnfg', 'backUrl', 'propertyNos', 'surveyNos',
      'hdnRevenueDistrict', 'hdnRevenueTaluka', 'hdnRevenueVillage',
      'closed_office_flag', 'hdnDistrict', 'hdnSroName', 'sroName', 'hdnZone',
      'cmb_Village', 'txt_SurveyNo', 'txt_SubDivisionNo', 'VILLAGE_SELECTION',
    ]);
    return html;
  }

  /**
   * Steps 6-7: request the print/download. POSTs the SAME form body with
   * actionVal=directPrintDwnLoad -> returns a "Success page" whose form
   * auto-submits to `web?` to stream the PDF. Returns a Buffer.
   *
   * `rec`/`captcha` must be the ones just searched (the server prints the
   * result held in session).
   */
  async downloadPdf(rec, captcha) {
    const ctx = this.printCtx || {};
    const body = {
      ...this.formBody(rec, captcha),
      ...ctx,                            // print-context values override search ones
      // tmpltMstID is the EC template (8400004); the results page leaves it
      // blank and the print JS sets it.
      tmpltMstID: ctx.tmpltMstID || rec.templateId || '8400004',
      actionVal: 'directPrintDwnLoad', screenId: '700786',
      // strip search-only fields the print request doesn't send
      txt_Captcha: '', multi_SurveyNo: '', multi_SubDivisionNo: '', multi_cmb_Village: '',
      txt_PeriodStartDt: '', txt_PeriodEndDt: '', countNoRecords: '',
    };
    const res = await this.postWeb(
      { actionVal: 'directPrintDwnLoad', screenId: '700786', _csrf: this.csrf },
      body
    );
    const html = String(res.data || '');

    // The "Success page" embeds the real download link:
    //   <a href="webHP?...actionVal=dwnLoadPdf&screenId=700786&attachId=<ID>...">
    // The attachId identifies the generated PDF. GET it to stream the bytes.
    const link = html.match(/href=["'](webHP\?[^"']*dwnLoadPdf[^"']*)["']/i);
    if (!link) {
      const title = (html.match(/<title>([^<]*)/i) || [])[1] || '';
      throw new Error(`no dwnLoadPdf link on success page (title: "${title.trim()}")`);
    }
    const url = '/' + link[1].replace(/&amp;/g, '&');
    const pdfRes = await this.http.get(url, {
      responseType: 'arraybuffer',
      headers: { Accept: 'application/pdf,*/*' },
    });
    const buf = Buffer.from(pdfRes.data);
    if (buf.slice(0, 5).toString('latin1') !== '%PDF-') {
      throw new Error(`dwnLoadPdf did not return a PDF (got ${buf.length} bytes, ` +
        `starts "${buf.slice(0, 8).toString('latin1')}")`);
    }
    return buf;
  }
}

/** Parse every <input name=.. value=..> in HTML into a { name: value } object. */
function allInputs(html) {
  const out = {};
  for (const m of html.matchAll(/<input\b[^>]*>/gi)) {
    const tag = m[0];
    const name = (tag.match(/\bname=["']([^"']+)["']/i) || [])[1];
    if (!name || name in out) continue;
    out[name] = (tag.match(/\bvalue=["']([^"']*)["']/i) || [])[1] || '';
  }
  return out;
}

/** Extract selected hidden-input values from HTML into an object. */
function pickHidden(html, names) {
  const out = {};
  for (const n of names) {
    const esc = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m =
      html.match(new RegExp(`id=["']${esc}["'][^>]*value=["']([^"']*)["']`, 'i')) ||
      html.match(new RegExp(`name=["']${esc}["'][^>]*value=["']([^"']*)["']`, 'i')) ||
      html.match(new RegExp(`value=["']([^"']*)["'][^>]*(?:id|name)=["']${esc}["']`, 'i'));
    if (m) out[n] = m[1];
  }
  return out;
}

function todayDDMMYYYY() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

module.exports = { TnreginetClient };
