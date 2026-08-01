'use strict';

/**
 * Parser for Tamil Nadu Encumbrance Certificate (EC) PDFs.
 *
 * The EC is a bilingual (English/Tamil) document produced by tnreginet.gov.in.
 * It has:
 *   - a header block (SRO, village, survey, search period, data availability)
 *   - N document records (the encumbrances)
 *   - a footer ("Number of Entries" + disclaimer)
 *
 * Each record is a flattened table row:
 *   <DocNo>/<Year>
 *   <Date of Execution>
 *   <Date of Presentation>
 *   <Date of Registration>
 *   <Nature> 1. <executant(s)> 1. <claimant(s)> <Vol/Page>
 *   Consideration Value/... : Rs. ...
 *   Market Value/... : Rs. ...
 *   PR Number/... : ...
 *   [Document Remarks/... : ...]
 *   Schedule 1 Details: <property fields...>
 *   [Schedule 2 Details: ...]
 *
 * We anchor on the English half of each bilingual label, which is stable
 * across every EC. Values (often Tamil, often multi-line) are captured up to
 * the next known label. Raw blocks are preserved so no information is lost even
 * where structured splitting is imperfect.
 */

const { PDFParse } = require('pdf-parse');
const fs = require('fs');

const DATE = '\\d{2}-[A-Za-z]{3}-\\d{4}';

// English label prefixes that mark the start of a field value. Order matters
// only for the "capture until next label" logic — all are tried as boundaries.
const FIELD_LABELS = [
  'Consideration Value',
  'Market Value',
  'PR Number',
  'Document Remarks',
  'Schedule Remarks',
  'Property Type',
  'Property Extent',
  'Survey No-Extent',
  'Survey No.',
  'Village & Street',
  'Building Name',
  'Floor No.',
  'Plot No.',
  'Flat No.',
  'New Door No.',
  'Old Door No.',
  'Ward No.',
  'Block No.',
  'Boundary Details',
];

// Lines that are page-header / page-footer noise repeated on every page.
const NOISE_PATTERNS = [
  /^-- \d+ of \d+ --$/,
  /^\d+ of \d+$/,
  /^GOVERNMENT OF TAMILNADU$/i,
  /^REGISTRATION DEPARTMENT$/i,
  /^Certificate of Encumbrance on Property$/i,
  /^Sr\. No\./,
  /^Document No\.& Year/,
  /^Date of Execution/,
  /^Nature\//,
  /^Name of Executant/,
  /^Name of Claimant/,
  /^Vol\.No & Page/,
  /^Zone:.*District:.*S\.R\.O/,
  /^Data Availability Period/,
  /^Search Period/,
  /^S\.R\.O\s*\/.*Date\s*\//,
  /^Village\s*\/.*Survey Details/,
  /^Disclaimer:/,
  /helpdesk@tnreginet\.net/,
  /^\d{4}\s*102\s*\d{4}$/, // toll-free number fragments
  /^\d{1,4}$/,             // bare page-number / serial-number lines
];

function normalizeWhitespace(s) {
  if (s == null) return s;
  return s
    .replace(/­/g, '')          // soft hyphen
    .replace(/[​-‏]/g, '') // zero-width chars
    .replace(/\t/g, ' ')             // tabs used mid-word in Tamil
    .replace(/[  ]+/g, ' ')     // collapse spaces
    .replace(/\s*\n\s*/g, '\n')      // trim around newlines
    .trim();
}

function cleanValue(s) {
  if (s == null) return null;
  const v = normalizeWhitespace(s).replace(/\n+/g, ' ').trim();
  if (v === '' || v === '-' || v === ':') return null;
  return v;
}

/** Strip repeated page header/footer lines from a record's raw text. */
function stripNoise(text) {
  return text
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      if (t === '') return false;
      return !NOISE_PATTERNS.some((re) => re.test(t));
    })
    .join('\n');
}

/**
 * Extract the value for an English label prefix, capturing everything after
 * "Label/<tamil>:" up to the next known label (or end of block).
 */
function extractField(block, label) {
  // Match: Label + optional "/<tamil>" + ":" then capture lazily.
  const boundary = FIELD_LABELS.map((l) => l.replace(/[.&]/g, '\\$&')).join('|');
  const re = new RegExp(
    `${label.replace(/[.&]/g, '\\$&')}\\s*(?:/[^:]*)?:\\s*([\\s\\S]*?)(?=(?:${boundary})\\s*(?:/[^:]*)?:|Schedule\\s+\\d+\\s+Details:|$)`
  );
  const m = block.match(re);
  return m ? cleanValue(m[1]) : null;
}

/**
 * Parse a money value into a number, else null. Handles both the English
 * "Rs. 1,50,000/-" and the Tamil "ரூ. 1,50,000/-" forms the portal emits.
 */
function parseMoney(raw) {
  if (!raw) return null;
  const m = raw.replace(/,/g, '').match(/(?:Rs|ரூ)\.?\s*([\d.]+)/i);
  return m ? Number(m[1]) : null;
}

/**
 * Parse the party row: "<Nature> 1. <executants> 1. <claimants> <vol/page>".
 * Executants and claimants both use "1. 2. 3." numbering; the claimant group
 * restarts at "1.". We split on that reset. Names are kept raw as an array.
 */
function parsePartyRow(rawRow) {
  const row = normalizeWhitespace(rawRow).replace(/\n/g, ' ').trim();
  const result = {
    nature: null,
    executants: [],
    claimants: [],
    volPageNo: null,
    raw: row || null,
  };
  if (!row) return result;

  const firstNum = row.search(/\b1\.\s/);
  if (firstNum === -1) {
    result.nature = cleanValue(row);
    return result;
  }
  result.nature = cleanValue(row.slice(0, firstNum));

  const rest = row.slice(firstNum);
  // Split into numbered tokens: [ "1", text, "2", text, "1", text, ... ]
  const parts = rest.split(/\b(\d+)\.\s/).filter((p) => p !== '');
  const groups = [[]]; // groups[0] = executants, groups[1] = claimants
  let prev = 0;
  for (let i = 0; i < parts.length; i += 2) {
    const num = parseInt(parts[i], 10);
    const text = (parts[i + 1] || '').trim();
    if (Number.isNaN(num)) continue;
    if (num <= prev && groups.length < 2) groups.push([]); // reset -> claimants
    prev = num;
    groups[groups.length - 1].push(text);
  }

  const exec = groups[0] || [];
  const claim = groups[1] || [];

  // The last claimant token often has a trailing vol/page ("- " or "12/34").
  if (claim.length) {
    const last = claim[claim.length - 1];
    const vp = last.match(/\s([-]|\d+[/-]\d+|\d+)\s*$/);
    if (vp) {
      result.volPageNo = vp[1] === '-' ? null : vp[1];
      claim[claim.length - 1] = last.slice(0, vp.index).trim();
    }
  } else if (exec.length) {
    const last = exec[exec.length - 1];
    const vp = last.match(/\s([-]|\d+[/-]\d+|\d+)\s*$/);
    if (vp) {
      result.volPageNo = vp[1] === '-' ? null : vp[1];
      exec[exec.length - 1] = last.slice(0, vp.index).trim();
    }
  }

  result.executants = exec.map(cleanValue).filter(Boolean);
  result.claimants = claim.map(cleanValue).filter(Boolean);
  return result;
}

/** Parse one Schedule block into its property fields. */
function parseSchedule(block) {
  return {
    propertyType: extractField(block, 'Property Type'),
    propertyExtent: extractField(block, 'Property Extent'),
    surveyNoExtent: extractField(block, 'Survey No-Extent'),
    surveyNo: extractField(block, 'Survey No.'),
    villageStreet: extractField(block, 'Village & Street'),
    buildingName: extractField(block, 'Building Name'),
    floorNo: extractField(block, 'Floor No.'),
    plotNo: extractField(block, 'Plot No.'),
    flatNo: extractField(block, 'Flat No.'),
    newDoorNo: extractField(block, 'New Door No.'),
    oldDoorNo: extractField(block, 'Old Door No.'),
    wardNo: extractField(block, 'Ward No.'),
    blockNo: extractField(block, 'Block No.'),
    boundaryDetails: extractField(block, 'Boundary Details'),
    scheduleRemarks: extractField(block, 'Schedule Remarks'),
  };
}

/** Parse a single document record's text into a structured object. */
function parseRecord(recordText, index) {
  const block = stripNoise(recordText);

  // Header: DocNo/Year + 3 dates (clean form).
  const headRe = new RegExp(
    `(\\d+)\\s*/\\s*(\\d{4})\\s*\\n\\s*(${DATE})\\s*\\n\\s*(${DATE})\\s*\\n\\s*(${DATE})`
  );
  let h = block.match(headRe);

  // Scrambled form (page-break record): docno appears as "<serial> <docno>/<year> 1."
  // and its up-to-3 dates are scattered in the chunk. Reconstruct best-effort.
  let scrambled = false;
  if (!h) {
    const docM = block.match(/\b(\d+)\/(\d{4})\s+1\./) || block.match(/\b(\d+)\/(\d{4})\b/);
    const dates = [...block.matchAll(new RegExp(DATE, 'g'))].map((m) => m[0]);
    if (docM) {
      scrambled = true;
      h = [null, docM[1], docM[2], dates[0] || null, dates[1] || null, dates[2] || null];
      h.index = block.indexOf(docM[0]);
      h[0] = docM[0];
    }
  }

  const record = {
    serialNo: index + 1,
    documentNo: h ? h[1] : null,
    documentYear: h ? h[2] : null,
    documentNoYear: h ? `${h[1]}/${h[2]}` : null,
    dateOfExecution: h ? h[3] : null,
    dateOfPresentation: h ? h[4] : null,
    dateOfRegistration: h ? h[5] : null,
    nature: null,
    executants: [],
    claimants: [],
    volPageNo: null,
    considerationValue: null,
    considerationValueRaw: null,
    marketValue: null,
    marketValueRaw: null,
    prNumbers: [],
    documentRemarks: null,
    schedules: [],
  };

  // Party row: text between the registration date and "Consideration Value".
  if (h) {
    const afterDates = block.slice(h.index + h[0].length);
    const cvIdx = afterDates.search(/Consideration Value/);
    const partyRaw = cvIdx === -1 ? afterDates : afterDates.slice(0, cvIdx);
    const party = parsePartyRow(partyRaw);
    record.nature = party.nature;
    record.executants = party.executants;
    record.claimants = party.claimants;
    record.volPageNo = party.volPageNo;
  }

  record.considerationValueRaw = extractField(block, 'Consideration Value');
  record.considerationValue = parseMoney(record.considerationValueRaw);
  record.marketValueRaw = extractField(block, 'Market Value');
  record.marketValue = parseMoney(record.marketValueRaw);

  const pr = extractField(block, 'PR Number');
  record.prNumbers = pr
    ? pr.split(',').map((s) => s.trim()).filter((s) => s && s !== '-')
    : [];

  record.documentRemarks = extractField(block, 'Document Remarks');

  // Schedules: split on "Schedule N Details:".
  const schedParts = block.split(/Schedule\s+\d+\s+Details:/);
  for (let i = 1; i < schedParts.length; i++) {
    const sched = parseSchedule(schedParts[i]);
    if (Object.values(sched).some((v) => v != null)) {
      record.schedules.push(sched);
    }
  }

  return record;
}

/** Extract the header metadata block (top of page 1). */
function parseHeader(fullText) {
  const grab = (re) => {
    const m = fullText.match(re);
    return m ? cleanValue(m[1]) : null;
  };
  const zone = fullText.match(/Zone:\s*([^\n]*?)\s*District:\s*([^\n]*?)\s*S\.R\.O:\s*([^\n]+)/);
  return {
    sro: grab(/S\.R\.O\s*\/[^:]*:\s*([^\n]+?)\s*Date/),
    certificateDate: grab(/Date\s*\/\s*[^:]*:\s*(\d{2}-[A-Za-z]{3}-\d{4})/),
    village: grab(/Village\s*\/[^:]*:\s*([^\n]+?)\s*Survey Details/),
    surveyDetails: grab(/Survey Details\s*\/[^:]*:\s*([^\n]+)/),
    searchPeriod: grab(/Search Period\s*\/[^:]*:\s*([^\n]+)/),
    dataAvailability: grab(/Data Availability Period[^\n]*\n[^\n]*From ([^\n]+)/),
    zone: zone ? cleanValue(zone[1]) : null,
    district: zone ? cleanValue(zone[2]) : null,
    registrationSro: zone ? cleanValue(zone[3]) : null,
  };
}

/** Parse the full EC PDF text into { header, records, footer }. */
function parseECText(fullText) {
  const header = parseHeader(fullText);

  const numEntriesMatch = fullText.match(/Number of Entries\s*\/[^:]*:\s*(\d+)/);
  const numberOfEntries = numEntriesMatch ? Number(numEntriesMatch[1]) : null;

  // Cut off the footer so it isn't swept into the last record.
  const bodyEnd = fullText.search(/Number of Entries\s*\//);
  const rawBody = bodyEnd === -1 ? fullText : fullText.slice(0, bodyEnd);

  // Strip repeated page header/footer + bare number lines FIRST, so records
  // whose DocNo/dates straddle a page break become contiguous again.
  const body = stripNoise(rawBody);

  // Find every record-start by index, then slice each record from its start to
  // the next. Two header shapes occur:
  //   (A) clean:     DocNo/Year \n date \n date \n date
  //   (B) scrambled: <serialNo> DocNo/Year 1.   (page-break flattening jumbles
  //       the columns; dates land around the "-- N of M --" marker nearby)
  const cleanRe = new RegExp(
    `\\d+\\s*/\\s*\\d{4}\\s*\\n\\s*${DATE}\\s*\\n\\s*${DATE}\\s*\\n\\s*${DATE}`,
    'g'
  );
  // DocNo/Year followed shortly by a "1." party marker — covers page-break
  // scrambles like "<serial> <docno> <nature words> 1.". The [^0-9] window
  // forbids other numbers (dates, PR/survey numbers) between the docno and the
  // "1.", so we only anchor on a genuine record header, not mid-record text.
  const scrambledRe = /(\d+\/\d{4})[^0-9]{0,45}?\b1\.\s/g;

  const marks = [];
  for (const m of body.matchAll(cleanRe)) marks.push({ index: m.index, type: 'clean' });
  for (const m of body.matchAll(scrambledRe)) {
    marks.push({ index: m.index, type: 'scrambled' });
  }
  marks.sort((a, b) => a.index - b.index);
  // Drop any start that falls within 40 chars of the previous one (dedupe
  // overlaps where both patterns fire on the same record).
  const starts = marks.filter((m, i) => i === 0 || m.index - marks[i - 1].index > 40);

  const chunks = starts.map((s, i) =>
    body.slice(s.index, i + 1 < starts.length ? starts[i + 1].index : body.length)
  );
  let records = chunks.map((c, i) => parseRecord(c, i));

  // Merge false splits: EC document numbers are unique, so consecutive records
  // sharing a documentNoYear are one record the anchor over-split. Fold the
  // second into the first (fill blanks, concat schedules) and drop it.
  records = mergeSplitRecords(records);
  records.forEach((r, i) => { r.serialNo = i + 1; });

  // Completeness: compare parsed count to the footer's declared entry count so
  // any missed records surface instead of failing silently.
  const complete = numberOfEntries == null || records.length === numberOfEntries;

  return {
    header,
    footer: { numberOfEntries },
    recordCount: records.length,
    complete,
    missingCount: numberOfEntries == null ? null : numberOfEntries - records.length,
    records,
  };
}

/** Count non-empty fields, a proxy for how "complete" a record is. */
function richness(rec) {
  let n = 0;
  for (const [k, v] of Object.entries(rec)) {
    if (k === 'serialNo') continue;
    if (Array.isArray(v)) n += v.length;
    else if (v != null && v !== '') n += 1;
  }
  return n;
}

/**
 * Deduplicate records sharing a documentNoYear. EC document numbers are unique,
 * so duplicates come from the anchor over-splitting one record (the doc number
 * also appearing in a remark/PR field). Keep the richest occurrence, fold the
 * others' schedules into it, and drop them — preserving original order.
 */
function mergeSplitRecords(records) {
  const keepFor = new Map(); // docNoYear -> chosen record
  for (const rec of records) {
    if (!rec.documentNoYear) continue;
    const cur = keepFor.get(rec.documentNoYear);
    if (!cur || richness(rec) > richness(cur)) keepFor.set(rec.documentNoYear, rec);
  }

  const emitted = new Set();
  const out = [];
  for (const rec of records) {
    if (!rec.documentNoYear) { out.push(rec); continue; }
    const chosen = keepFor.get(rec.documentNoYear);
    if (rec === chosen) {
      // Fold schedules from all same-docNo duplicates into the chosen record.
      const seen = new Set(chosen.schedules.map((s) => JSON.stringify(s)));
      for (const other of records) {
        if (other !== chosen && other.documentNoYear === rec.documentNoYear) {
          for (const s of other.schedules) {
            const key = JSON.stringify(s);
            if (!seen.has(key)) { seen.add(key); chosen.schedules.push(s); }
          }
        }
      }
      out.push(chosen);
      emitted.add(rec.documentNoYear);
    }
    // non-chosen duplicates are skipped
  }
  return out;
}

/** Parse an EC PDF file on disk. Returns the structured object + metadata. */
async function parseECFile(filePath) {
  const buf = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: buf });
  try {
    const res = await parser.getText();
    const parsed = parseECText(res.text);
    parsed.source = {
      file: filePath,
      pages: res.total,
      textLength: res.text.length,
      parsedAt: new Date().toISOString(),
    };
    return parsed;
  } finally {
    await parser.destroy();
  }
}

module.exports = {
  parseECFile,
  parseECText,
  parseRecord,
  parsePartyRow,
  parseHeader,
};

// CLI: node src/pdfParser.js <file.pdf> [out.json]
if (require.main === module) {
  const file = process.argv[2] || 'Docs/APP_8400001_TXN_565232906_TMPLT_8400004.pdf';
  const out = process.argv[3];
  parseECFile(file)
    .then((parsed) => {
      if (out) {
        fs.writeFileSync(out, JSON.stringify(parsed, null, 2));
        console.log(`Parsed ${parsed.recordCount} records -> ${out}`);
      } else {
        console.log(JSON.stringify(parsed, null, 2));
      }
    })
    .catch((e) => {
      console.error('Parse failed:', e.message);
      process.exit(1);
    });
}
