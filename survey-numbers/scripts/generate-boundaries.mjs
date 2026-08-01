// Generate boundary GeoJSON per survey number for one revenue village.
// One file per survey number: SurveyNo_<n>.geojson (all its parcel polygons).
import fs from 'fs';
import path from 'path';

const OWS = 'https://tngis.tn.gov.in/app/ows';
const LAYER = 'cadastral_analysis:fmb_ulpin';
const HEADERS = { 'Referer': 'https://tngis.tn.gov.in/apps/gi_viewer/map-viewer/index.html' };

const VCODE = process.argv[2] || '006';
const VNAME = process.argv[3] || 'Naduvakkarai';
const OUTDIR = process.argv[4] || `.`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchAll() {
  let start = 0, matched = Infinity, out = [];
  while (start < matched) {
    const p = new URLSearchParams({
      service: 'WFS', version: '2.0.0', request: 'GetFeature', typeNames: LAYER,
      outputFormat: 'application/json', srsName: 'EPSG:4326', sortBy: 'id',
      count: '1000', startIndex: String(start),
      cql_filter: `lgd_district_code=568 AND taluk_code=5 AND village_code='${VCODE}'`,
    });
    const j = JSON.parse(await (await fetch(`${OWS}?${p}`, { headers: HEADERS })).text());
    matched = j.numberMatched;
    for (const f of j.features) out.push(f);
    start += 1000;
    console.error(`  fetched ${out.length}/${matched}`);
    if (j.numberReturned === 0) break;
    await sleep(120);
  }
  return out;
}

const feats = await fetchAll();
const bySn = {};
for (const f of feats) {
  const sn = f.properties.survey_number ?? 'unknown';
  (bySn[sn] = bySn[sn] || []).push({
    type: 'Feature',
    properties: {
      survey_number: sn,
      sub_division: f.properties.sub_division || '',
      parcel_id: f.properties.id,
      village: VNAME,
    },
    geometry: f.geometry,
  });
}

const dir = path.join(OUTDIR, `${VNAME}_boundaries`);
fs.mkdirSync(dir, { recursive: true });
const safe = s => String(s).replace(/[^0-9A-Za-z._-]/g, '_');
let files = 0;
const allFeatures = [];
for (const [sn, features] of Object.entries(bySn)) {
  const fc = { type: 'FeatureCollection', name: `${VNAME}_survey_${sn}`, features };
  fs.writeFileSync(path.join(dir, `SurveyNo_${safe(sn)}.geojson`), JSON.stringify(fc));
  allFeatures.push(...features);
  files++;
}
// one combined file with every parcel (colour/group by survey number)
fs.writeFileSync(path.join(dir, `_ALL_${VNAME}_surveys.geojson`),
  JSON.stringify({ type: 'FeatureCollection', name: `${VNAME}_all`, features: allFeatures }));

console.log(`\nDONE. village ${VNAME} (${VCODE})`);
console.log(`  survey numbers: ${files}  | total parcels: ${allFeatures.length}`);
console.log(`  → ${files} boundary files + 1 combined, in: ${dir}`);
