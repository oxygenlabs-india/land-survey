// TNGIS survey-number extractor for Chennai district (code 02).
// Walks rural (Taluk->Village->Survey) and urban (Taluk->Town->Ward->Block->Survey) chains.
// Public API; only needs Referer + X-APP-NAME headers.
import fs from 'fs';

const BASE = 'https://tngis.tn.gov.in/apps/generic_api/v2';
const DISTRICT = '02';
const DISTRICT_NAME = 'Chennai';
const OUT = process.argv[2] || 'chennai_survey_numbers.csv';
const HEADERS = {
  'Referer': 'https://tngis.tn.gov.in/apps/gi_viewer/map-viewer/index.html',
  'X-APP-NAME': 'demo',
  'X-Requested-With': 'XMLHttpRequest',
  'Accept': 'application/json, text/javascript, */*; q=0.01',
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(path, params) {
  const url = `${BASE}/${path}?` + new URLSearchParams(params).toString();
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      const j = await res.json();
      if (j && j.success == 1) return j.data || [];
      // success 0/3 => no data or param issue; treat as empty
      return [];
    } catch (e) {
      if (attempt === 4) { console.error('FAIL', url, e.message); return []; }
      await sleep(500 * attempt);
    }
  }
  return [];
}

const rows = [];
const csvCell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
let apiCalls = 0;
const throttle = async () => { apiCalls++; await sleep(120); };

async function run() {
  const taluks = await get('admin_master_taluk', { district_code: DISTRICT, request_type: 'taluk' });
  console.log(`Taluks: ${taluks.length}`);

  for (const t of taluks) {
    const tc = t.taluk_code, tn = t.taluk_english_name;

    // ---------- RURAL ----------
    await throttle();
    const villages = await get('admin_master_village', { district_code: DISTRICT, taluk_code: tc, request_type: 'revenue_village' });
    for (const v of villages) {
      await throttle();
      const sns = await get('admin_master_survey_number', {
        district_code: DISTRICT, taluk_code: tc, revenue_village_code: v.village_code,
        area_type: 'rural', data_type: 'cadastral', request_type: 'survey_number',
      });
      for (const s of sns) {
        rows.push(['rural', tc, tn, v.village_code, v.village_english_name, '', '', '', '', s.survey_number]);
      }
      console.log(`  [rural] ${tn} / ${v.village_english_name}: ${sns.length}`);
    }

    // ---------- URBAN ----------
    await throttle();
    const towns = await get('admin_master_revenue_town', { request_type: 'town', district_code: DISTRICT, taluk_code: tc });
    for (const tw of towns) {
      await throttle();
      const wards = await get('admin_master_revenue_ward', { request_type: 'ward', district_code: DISTRICT, taluk_code: tc, town_code: tw.town_code });
      for (const w of wards) {
        await throttle();
        const blocks = await get('admin_master_revenue_block', { request_type: 'revenue_block', district_code: DISTRICT, taluk_code: tc, town_code: tw.town_code, ward_code: w.ward_code });
        for (const b of blocks) {
          await throttle();
          const sns = await get('admin_master_survey_number', {
            district_code: DISTRICT, taluk_code: tc, town_code: tw.town_code, ward_code: w.ward_code,
            block_code: b.block_code, area_type: 'urban', request_type: 'survey_number',
          });
          for (const s of sns) {
            rows.push(['urban', tc, tn, tw.town_english_name, tw.town_code, w.ward_english_name, b.block_english_name, w.ward_code, b.block_code, s.survey_number]);
          }
          console.log(`  [urban] ${tn} / ${tw.town_english_name} / W${w.ward_code} / B${b.block_code}: ${sns.length}`);
        }
      }
    }
  }

  const header = ['area_type','taluk_code','taluk_name','area_code','area_name','ward_name','block_name','ward_code','block_code','survey_number'];
  const lines = [header.join(',')];
  for (const r of rows) lines.push(r.map(csvCell).join(','));
  fs.writeFileSync(OUT, '﻿' + lines.join('\r\n'), 'utf8');
  console.log(`\nDONE. ${rows.length} survey-number rows across ${apiCalls} API calls -> ${OUT}`);
}
run();
