'use strict';

/**
 * Captcha solver for tnreginet.gov.in.
 *
 * The portal serves an open-source **SimpleCaptcha** (Java) image via a servlet
 * literally named `/portal/SimpleCaptcha`: a 5-char alphanumeric glyph string
 * (uppercase A-Z + digits) over a yellow grid mesh with one thin ellipse line.
 * It is self-hosted — there is no reCAPTCHA/hCaptcha/Turnstile anti-bot service
 * involved.
 *
 * Engine: **ddddocr** (via `ddddocr-node`) — an offline, open-source ONNX OCR
 * built for exactly this class of classic text captcha. It beats generic
 * Tesseract substantially here (exact hits with zero training).
 *
 * Because the portal exposes a FREE, standalone `checkCaptcha` validation
 * endpoint and a FREE image refresh, OCR need not be perfect. We squeeze every
 * fetched image by producing several candidate reads (raw + grid-removed
 * variants); the caller validates each candidate before spending a refetch.
 *
 * Higher accuracy later (optional): SimpleCaptcha is BSD-licensed, so we can
 * generate unlimited labelled images locally and train a small CNN — the
 * published SJSU result reaches ~96% full-string / ~99% per-char this way.
 */

const sharp = require('sharp');
const { DdddOcr, CHARSET_RANGE } = require('ddddocr-node');

const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const EXPECTED_LEN = 5;

let ocrInstance = null;
function getOcr() {
  if (!ocrInstance) ocrInstance = new DdddOcr();
  return ocrInstance;
}

/**
 * Grid-removal preprocessing. Colour analysis shows the glyphs are the only
 * DARK pixels (max channel <= ~64) while the yellow grid + gray background are
 * bright (>=128). Keep dark pixels black, whiten the rest — this erases the
 * grid in one pass. A light median removes thin ellipse speckle.
 *
 * @param {Buffer} pngBuffer
 * @param {number} [darkness=110]
 */
async function preprocess(pngBuffer, darkness = 110) {
  const { data, info } = await sharp(pngBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const mono = Buffer.alloc(width * height);
  for (let p = 0, i = 0; i < data.length; i += channels, p++) {
    const brightness = Math.max(data[i], data[i + 1], data[i + 2]);
    mono[p] = brightness < darkness ? 0 : 255;
  }

  return sharp(mono, { raw: { width, height, channels: 1 } })
    .median(1)
    .resize({ width: width * 2, height: height * 2, kernel: 'cubic' })
    .png()
    .toBuffer();
}

const normalize = (s) =>
  (s || '').toString().toUpperCase().replace(new RegExp(`[^${CHARSET}]`, 'g'), '').trim();

/**
 * Produce an ordered list of unique candidate reads for one captcha image.
 * Candidates come from the raw image and a couple of grid-removed variants,
 * with and without the uppercase+digits charset constraint. Ordering prefers
 * candidates of the expected length.
 *
 * @param {Buffer} pngBuffer
 * @returns {Promise<string[]>}
 */
async function candidates(pngBuffer) {
  const ocr = getOcr();
  const variants = [pngBuffer];
  try { variants.push(await preprocess(pngBuffer, 110)); } catch { /* ignore */ }
  try { variants.push(await preprocess(pngBuffer, 95)); } catch { /* ignore */ }

  // Two charset ranges: tight (uppercase+digits, matches the portal) and broad
  // (mixed-case+digits) — the broad model sometimes reads noisy glyphs better,
  // and normalize() uppercases the result anyway.
  const ranges = [CHARSET_RANGE.MIX_UPPER_NUM_CASE, CHARSET_RANGE.MIX_LOWER_UPPER_NUM_CASE];
  const seen = new Set();
  const out = [];
  for (const img of variants) {
    for (const range of ranges) {
      try {
        ocr.setRanges(range);
        const raw = await ocr.classification(img);
        const text = normalize(raw);
        if (text && !seen.has(text)) { seen.add(text); out.push(text); }
      } catch { /* ignore this variant */ }
    }
  }
  // Expected-length candidates first, then the rest.
  return out.sort((a, b) => {
    const al = a.length === EXPECTED_LEN ? 0 : 1;
    const bl = b.length === EXPECTED_LEN ? 0 : 1;
    return al - bl;
  });
}

/**
 * Best single guess for a captcha image (first expected-length candidate).
 * @returns {Promise<{ text: string, candidates: string[] }>}
 */
async function solveCaptcha(pngBuffer) {
  const cands = await candidates(pngBuffer);
  const best = cands.find((c) => c.length === EXPECTED_LEN) || cands[0] || '';
  return { text: best, candidates: cands };
}

// No persistent worker to tear down (ddddocr instance is reused); kept for API
// compatibility with callers.
async function terminate() { ocrInstance = null; }

module.exports = { solveCaptcha, candidates, preprocess, terminate, CHARSET, EXPECTED_LEN };

// CLI: node src/captcha.js <captcha.png>
if (require.main === module) {
  const fs = require('fs');
  const file = process.argv[2];
  if (!file) {
    console.error('usage: node src/captcha.js <captcha.png>');
    process.exit(1);
  }
  (async () => {
    const buf = fs.readFileSync(file);
    const res = await solveCaptcha(buf);
    console.log(`best: "${res.text}"  candidates: [${res.candidates.join(', ')}]`);
  })();
}
