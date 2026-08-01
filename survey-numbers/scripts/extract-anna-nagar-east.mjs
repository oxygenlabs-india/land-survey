// Anna Nagar East survey numbers v2 — two-sheet xlsx:
//  Sheet 1 "Survey Numbers": distinct survey number per village + plot count.
//  Sheet 2 "All Plots": every parcel with unique Parcel ID.
import fs from 'fs';

const OWS = 'https://tngis.tn.gov.in/app/ows';
const LAYER = 'cadastral_analysis:fmb_ulpin';
const HEADERS = { 'Referer': 'https://tngis.tn.gov.in/apps/gi_viewer/map-viewer/index.html' };
const VILLAGES = { '006': 'Naduvakkarai', '003': 'Periyakudal', '009': 'Aminjikarai' };
const OUT = process.argv[2] || 'AnnaNagarEast_SurveyNumbers.xlsx';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchAll(vcode) {
  let start = 0, matched = Infinity, out = [];
  while (start < matched) {
    const params = new URLSearchParams({
      service: 'WFS', version: '2.0.0', request: 'GetFeature', typeNames: LAYER,
      outputFormat: 'application/json', sortBy: 'id', count: '1000', startIndex: String(start),
      propertyName: 'id,survey_number,sub_division,centroid',
      cql_filter: `lgd_district_code=568 AND taluk_code=5 AND village_code='${vcode}'`,
    });
    const j = JSON.parse(await (await fetch(`${OWS}?${params}`, { headers: HEADERS })).text());
    matched = j.numberMatched;
    for (const f of j.features) out.push(f.properties);
    start += 1000;
    if (j.numberReturned === 0) break;
    await sleep(120);
  }
  return out;
}

const num = s => { const n = parseInt(String(s).replace(/[^0-9]/g, ''), 10); return isNaN(n) ? 1e9 : n; };

async function run() {
  const plots = [];              // all parcels
  const surveyAgg = {};          // village|sn -> count
  for (const [vcode, vname] of Object.entries(VILLAGES)) {
    const feats = await fetchAll(vcode);
    console.log(`  ${vname}: ${feats.length}`);
    for (const p of feats) {
      const sn = p.survey_number ?? '';
      const [lat, lon] = (p.centroid || '').split(',');
      plots.push({ vname, vcode, id: p.id, sn, sub: p.sub_division ?? '', lat: (lat||'').trim(), lon: (lon||'').trim() });
      const k = vname + '|' + sn;
      surveyAgg[k] = (surveyAgg[k] || 0) + 1;
    }
  }

  // Sheet 1: distinct survey numbers
  const surveyRows = Object.entries(surveyAgg).map(([k, c]) => { const [v, sn] = k.split('|'); return { v, sn, c }; })
    .sort((a, b) => a.v.localeCompare(b.v) || num(a.sn) - num(b.sn));
  const s1h = ['S.No', 'Locality', 'Revenue Village', 'Survey Number', 'No. of Plots'];
  const s1 = surveyRows.map((r, i) => [String(i+1), 'Anna Nagar East', r.v, r.sn, String(r.c)]);

  // Sheet 2: all plots with unique parcel id
  plots.sort((a, b) => a.vname.localeCompare(b.vname) || num(a.sn) - num(b.sn) || a.id - b.id);
  const s2h = ['S.No', 'Locality', 'Revenue Village', 'Village Code', 'Survey Number', 'Sub Division', 'Parcel ID (unique)', 'Latitude', 'Longitude'];
  const s2 = plots.map((r, i) => [String(i+1), 'Anna Nagar East', r.vname, r.vcode, r.sn, r.sub, String(r.id), r.lat, r.lon]);

  writeXlsx(OUT, [
    { name: 'Survey Numbers', headers: s1h, table: s1 },
    { name: 'All Plots', headers: s2h, table: s2 },
  ]);
  // CSV of the clean survey-number list too
  const csv = OUT.replace(/\.xlsx$/i, '_list.csv');
  const cc = v => `"${String(v??'').replace(/"/g,'""')}"`;
  fs.writeFileSync(csv, '﻿' + [s1h, ...s1].map(r => r.map(cc).join(',')).join('\r\n'), 'utf8');

  console.log(`\nDONE. distinct survey numbers: ${surveyRows.length} | total plots: ${plots.length}`);
  console.log(`  XLSX -> ${OUT}`);
  console.log(`  CSV  -> ${csv}`);
}

// ---------- multi-sheet XLSX (STORE zip, inlineStr) ----------
function xmlEsc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function colRef(n){let s='';n++;while(n){const m=(n-1)%26;s=String.fromCharCode(65+m)+s;n=(n-m-1)/26;}return s;}
function sheetXml(headers, table){
  let rowsXml='';
  [headers,...table].forEach((row,ri)=>{ let cells='';
    row.forEach((val,ci)=>{ cells+=`<c r="${colRef(ci)+(ri+1)}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(val)}</t></is></c>`;});
    rowsXml+=`<row r="${ri+1}">${cells}</row>`;});
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowsXml}</sheetData></worksheet>`;
}
function writeXlsx(path, sheets){
  const files={};
  const sheetOverrides = sheets.map((s,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
  files['[Content_Types].xml']=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheetOverrides}</Types>`;
  files['_rels/.rels']=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const sheetTags = sheets.map((s,i)=>`<sheet name="${xmlEsc(s.name).slice(0,31)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('');
  files['xl/workbook.xml']=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetTags}</sheets></workbook>`;
  const rels = sheets.map((s,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('');
  files['xl/_rels/workbook.xml.rels']=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`;
  sheets.forEach((s,i)=>{ files[`xl/worksheets/sheet${i+1}.xml`]=sheetXml(s.headers,s.table); });
  fs.writeFileSync(path, zipStore(files));
}
const CRC=(()=>{const t=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
function crc32(b){let c=0xFFFFFFFF;for(let i=0;i<b.length;i++)c=CRC[(c^b[i])&0xFF]^(c>>>8);return (c^0xFFFFFFFF)>>>0;}
function zipStore(files){
  const chunks=[],central=[]; let offset=0; const dt=0,dd=0x21<<9;
  for(const name of Object.keys(files)){
    const nb=Buffer.from(name,'utf8'), data=Buffer.from(files[name],'utf8'), crc=crc32(data);
    const lh=Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50,0);lh.writeUInt16LE(20,4);lh.writeUInt16LE(0,6);lh.writeUInt16LE(0,8);
    lh.writeUInt16LE(dt,10);lh.writeUInt16LE(dd,12);lh.writeUInt32LE(crc,14);lh.writeUInt32LE(data.length,18);
    lh.writeUInt32LE(data.length,22);lh.writeUInt16LE(nb.length,26);lh.writeUInt16LE(0,28);
    chunks.push(lh,nb,data);
    const ch=Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50,0);ch.writeUInt16LE(20,4);ch.writeUInt16LE(20,6);ch.writeUInt16LE(0,8);
    ch.writeUInt16LE(0,10);ch.writeUInt16LE(dt,12);ch.writeUInt16LE(dd,14);ch.writeUInt32LE(crc,16);
    ch.writeUInt32LE(data.length,20);ch.writeUInt32LE(data.length,24);ch.writeUInt16LE(nb.length,28);
    ch.writeUInt16LE(0,30);ch.writeUInt16LE(0,32);ch.writeUInt16LE(0,34);ch.writeUInt16LE(0,36);
    ch.writeUInt32LE(0,38);ch.writeUInt32LE(offset,42);
    central.push(Buffer.concat([ch,nb])); offset+=lh.length+nb.length+data.length;
  }
  const cd=Buffer.concat(central);
  const eocd=Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50,0);eocd.writeUInt16LE(0,4);eocd.writeUInt16LE(0,6);
  eocd.writeUInt16LE(central.length,8);eocd.writeUInt16LE(central.length,10);
  eocd.writeUInt32LE(cd.length,12);eocd.writeUInt32LE(offset,16);eocd.writeUInt16LE(0,20);
  return Buffer.concat([...chunks,cd,eocd]);
}
run().catch(e=>{console.error('FATAL',e);process.exit(1);});
