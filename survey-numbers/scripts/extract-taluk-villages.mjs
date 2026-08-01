// Extract every revenue village in Chennai Aminjikarai taluk (05) into a SEPARATE xlsx.
// Two sheets per file: "Survey Numbers" (distinct + plot count) and "All Plots".
import fs from 'fs';
import path from 'path';

const OWS = 'https://tngis.tn.gov.in/app/ows';
const LAYER = 'cadastral_analysis:fmb_ulpin';
const HEADERS = { 'Referer': 'https://tngis.tn.gov.in/apps/gi_viewer/map-viewer/index.html' };
const OUTDIR = process.argv[2] || '.';
const VILLAGES = {
  '001': 'Villivakkam', '002': 'Mullam', '003': 'Periyakudal', '004': 'Chinnakudal',
  '005': 'Thirumangalam', '006': 'Naduvakkarai', '007': 'Koyambedu', '008': 'Sencheri',
  '009': 'Aminjikarai', '010': 'Agaram', '011': 'Arumbakkam',
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const num = s => { const n = parseInt(String(s).replace(/[^0-9]/g, ''), 10); return isNaN(n) ? 1e9 : n; };

async function fetchAll(vcode) {
  let start = 0, matched = Infinity, out = [];
  while (start < matched) {
    const p = new URLSearchParams({
      service: 'WFS', version: '2.0.0', request: 'GetFeature', typeNames: LAYER,
      outputFormat: 'application/json', sortBy: 'id', count: '1000', startIndex: String(start),
      propertyName: 'id,survey_number,sub_division,centroid',
      cql_filter: `lgd_district_code=568 AND taluk_code=5 AND village_code='${vcode}'`,
    });
    const j = JSON.parse(await (await fetch(`${OWS}?${p}`, { headers: HEADERS })).text());
    matched = j.numberMatched;
    for (const f of j.features) out.push(f.properties);
    start += 1000;
    if (j.numberReturned === 0) break;
    await sleep(100);
  }
  return out;
}

const summary = [];
async function main() {
for (const [vcode, vname] of Object.entries(VILLAGES)) {
  const feats = await fetchAll(vcode);
  const agg = {};          // sn -> { c: plotCount, subs: Set }
  const plots = feats.map(p => {
    const sn = p.survey_number ?? '';
    const sub = (p.sub_division ?? '').toString().trim();
    if (!agg[sn]) agg[sn] = { c: 0, subs: new Set() };
    agg[sn].c += 1;
    if (sub) agg[sn].subs.add(sub);
    const [lat, lon] = (p.centroid || '').split(',');
    return { id: p.id, sn, sub, lat: (lat||'').trim(), lon: (lon||'').trim() };
  });
  const subSort = (a,b)=>num(a)-num(b);
  const s1 = Object.entries(agg).map(([sn, o]) => ({ sn, c: o.c, subs: [...o.subs].sort(subSort) }))
    .sort((a,b)=>num(a.sn)-num(b.sn))
    .map((r,i)=>[String(i+1), vname, r.sn, String(r.c), r.subs.join(', '), String(r.subs.length)]);
  plots.sort((a,b)=>num(a.sn)-num(b.sn)||a.id-b.id);
  const s2 = plots.map((r,i)=>[String(i+1), vname, r.sn, r.sub, String(r.id), r.lat, r.lon]);
  const file = path.join(OUTDIR, `${String(vcode)}_${vname}_SurveyNumbers.xlsx`);
  writeXlsx(file, [
    { name: 'Survey Numbers', headers: ['S.No','Revenue Village','Survey Number','No. of Plots','Sub-Divisions (available)','Sub-Div Count'], table: s1 },
    { name: 'All Plots', headers: ['S.No','Revenue Village','Survey Number','Sub Division','Parcel ID','Latitude','Longitude'], table: s2 },
  ]);
  summary.push({ vcode, vname, distinct: s1.length, plots: plots.length });
  console.log(`  ${vcode} ${vname}: ${s1.length} survey numbers / ${plots.length} plots -> ${path.basename(file)}`);
}
// combined index
const idx = summary.map((r,i)=>[String(i+1), r.vcode, r.vname, String(r.distinct), String(r.plots)]);
writeXlsx(path.join(OUTDIR,'00_INDEX_all_villages.xlsx'), [
  { name: 'Index', headers: ['S.No','Village Code','Revenue Village','Distinct Survey Numbers','Total Plots'], table: idx },
]);
console.log('\nTOTAL villages:', summary.length,
  '| survey numbers:', summary.reduce((a,b)=>a+b.distinct,0),
  '| plots:', summary.reduce((a,b)=>a+b.plots,0));
}

// ---------- multi-sheet XLSX writer ----------
function xmlEsc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function colRef(n){let s='';n++;while(n){const m=(n-1)%26;s=String.fromCharCode(65+m)+s;n=(n-m-1)/26;}return s;}
function sheetXml(h,t){let r='';[h,...t].forEach((row,ri)=>{let c='';row.forEach((v,ci)=>{c+=`<c r="${colRef(ci)+(ri+1)}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;});r+=`<row r="${ri+1}">${c}</row>`;});return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${r}</sheetData></worksheet>`;}
function writeXlsx(p, sheets){
  const files={};
  files['[Content_Types].xml']=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`+sheets.map((s,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')+`</Types>`;
  files['_rels/.rels']=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  files['xl/workbook.xml']=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>`+sheets.map((s,i)=>`<sheet name="${xmlEsc(s.name).slice(0,31)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')+`</sheets></workbook>`;
  files['xl/_rels/workbook.xml.rels']=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`+sheets.map((s,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')+`</Relationships>`;
  sheets.forEach((s,i)=>{files[`xl/worksheets/sheet${i+1}.xml`]=sheetXml(s.headers,s.table);});
  fs.writeFileSync(p, zipStore(files));
}
const CRC=(()=>{const t=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
function crc32(b){let c=0xFFFFFFFF;for(let i=0;i<b.length;i++)c=CRC[(c^b[i])&0xFF]^(c>>>8);return (c^0xFFFFFFFF)>>>0;}
function zipStore(files){const chunks=[],central=[];let off=0;for(const name of Object.keys(files)){const nb=Buffer.from(name,'utf8'),data=Buffer.from(files[name],'utf8'),crc=crc32(data);const lh=Buffer.alloc(30);lh.writeUInt32LE(0x04034b50,0);lh.writeUInt16LE(20,4);lh.writeUInt32LE(crc,14);lh.writeUInt32LE(data.length,18);lh.writeUInt32LE(data.length,22);lh.writeUInt16LE(nb.length,26);chunks.push(lh,nb,data);const ch=Buffer.alloc(46);ch.writeUInt32LE(0x02014b50,0);ch.writeUInt16LE(20,4);ch.writeUInt16LE(20,6);ch.writeUInt32LE(crc,16);ch.writeUInt32LE(data.length,20);ch.writeUInt32LE(data.length,24);ch.writeUInt16LE(nb.length,28);ch.writeUInt32LE(off,42);central.push(Buffer.concat([ch,nb]));off+=lh.length+nb.length+data.length;}const cd=Buffer.concat(central);const eo=Buffer.alloc(22);eo.writeUInt32LE(0x06054b50,0);eo.writeUInt16LE(central.length,8);eo.writeUInt16LE(central.length,10);eo.writeUInt32LE(cd.length,12);eo.writeUInt32LE(off,16);return Buffer.concat([...chunks,cd,eo]);}

await main();
