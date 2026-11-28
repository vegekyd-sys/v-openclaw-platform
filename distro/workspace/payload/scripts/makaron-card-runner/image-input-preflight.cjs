'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // CLI 0.17.2 validateImage contract

function inputError(message) {
  const error = new Error(message);
  error.code = 'MAKARON_IMAGE_INPUT_INVALID';
  return error;
}

// Preparation is local and completes before chat can create a remote project.
// Never modify the user's original or silently flatten animation/transparency.
async function prepareImageInputs(assets, {cacheDir = path.join(os.tmpdir(), 'makaron-image-inputs')} = {}) {
  const prepared = [];
  const memo = new Map();
  for (const asset of assets) {
    if (asset.type !== 'image' || /^https?:\/\//i.test(asset.path)) {
      prepared.push({...asset});
      continue;
    }
    const source = path.resolve(asset.path);
    if (memo.has(source)) { prepared.push({...asset, path:memo.get(source)}); continue; }
    let stat;
    try { stat = fs.statSync(source); } catch { throw inputError('Image attachment is missing; attach the local file before submitting.'); }
    if (!stat.isFile() || stat.size === 0) throw inputError('Image attachment must be a non-empty local file.');
    if (stat.size <= MAX_IMAGE_BYTES) {
      memo.set(source, asset.path);
      prepared.push({...asset});
      continue;
    }
    const sharp = require('sharp');
    let metadata;
    try { metadata = await sharp(source, {limitInputPixels:40_000_000}).metadata(); }
    catch { throw inputError('Oversized image cannot be decoded safely; provide a supported still image.'); }
    if (!['jpeg','png','webp'].includes(metadata.format) || (metadata.pages || 1) !== 1) {
      throw inputError('Oversized animated or unsupported image needs an explicit conversion decision.');
    }
    // Preserve orientation, aspect ratio and alpha. No crop, background or upscaling.
    const input = fs.readFileSync(source);
    const digest = crypto.createHash('sha256').update(input).update('webp-v1').digest('hex');
    fs.mkdirSync(cacheDir, {recursive:true, mode:0o700});
    let result;
    for (const quality of [90, 80, 70]) {
      result = await sharp(input, {limitInputPixels:40_000_000}).rotate().webp({quality, effort:2}).toBuffer();
      if (result.length <= MAX_IMAGE_BYTES) break;
    }
    if (!result || result.length > MAX_IMAGE_BYTES) throw inputError('Image cannot fit the upload limit without further quality changes; no chat was submitted.');
    const target = path.join(cacheDir, `${digest}.webp`);
    // An atomic, per-attempt temporary avoids partial files on concurrent submissions.
    const tmp = `${target}.${crypto.randomUUID()}.tmp`;
    try { fs.writeFileSync(tmp, result, {mode:0o600}); fs.renameSync(tmp, target); }
    finally { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); }
    memo.set(source, target);
    prepared.push({...asset, path:target});
  }
  return prepared;
}

module.exports = {prepareImageInputs, MAX_IMAGE_BYTES};
