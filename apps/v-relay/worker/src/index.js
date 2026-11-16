// v-relay: a Cloudflare Worker in front of one private R2 bucket, so V, its
// nodes and Tianyi's Mac can hand each other large files without holding any
// Cloudflare credential. Machines only hold a relay token (RELAY_TOKENS); the
// R2 binding never leaves the Worker. See apps/v-relay/README.md.
//
// Only Web platform APIs are used so the same module runs under node --test
// with an in-memory bucket (tests/v-relay-*.test.mjs).

const MiB = 1024 * 1024;
// Workers reject request bodies over 100 MB (Free and Paid). Stay under it.
export const MAX_PART_BYTES = 95 * MiB;
// R2: every part except the last must be at least 5 MiB, and all non-final
// parts must have the same size.
export const MIN_PART_BYTES = 5 * MiB;
export const MAX_PARTS = 10000;
const DEFAULT_MAX_OBJECT_BYTES = 50 * 1024 * MiB;
const MAX_LINK_SECONDS = 7 * 24 * 3600;
const ID_RE = /^[a-z0-9]{6,32}$/;
const SHA256_RE = /^[a-f0-9]{64}$/;
const ID_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
const encoder = new TextEncoder();

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers}});
}

function newId(length = 12) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = '';
  for (const b of bytes) out += ID_ALPHABET[b % ID_ALPHABET.length];
  return out;
}

const objectKey = id => `o/${id}`;

async function sha256Bytes(text) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
}

function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function hex(bytes) {
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}

// RELAY_TOKENS: comma-separated "label=token" (or bare "token", label "default").
// Comparison is on SHA-256 digests so lengths never leak.
export function parseTokens(raw) {
  const out = [];
  for (const item of String(raw ?? '').split(',').map(s => s.trim()).filter(Boolean)) {
    const eq = item.indexOf('=');
    const label = eq > 0 ? item.slice(0, eq).trim() : 'default';
    const token = eq > 0 ? item.slice(eq + 1).trim() : item;
    if (token.length >= 24) out.push({label, token});
  }
  return out;
}

async function authenticate(request, env) {
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return null;
  const presented = await sha256Bytes(match[1].trim());
  let found = null;
  for (const {label, token} of parseTokens(env.RELAY_TOKENS)) {
    // Check every entry; no early exit.
    if (bytesEqual(presented, await sha256Bytes(token)) && !found) found = label;
  }
  return found;
}

async function hmacHex(key, message) {
  const k = await crypto.subtle.importKey('raw', encoder.encode(key), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  return hex(new Uint8Array(await crypto.subtle.sign('HMAC', k, encoder.encode(message))));
}

async function linkSignature(env, id, exp) {
  if (!env.RELAY_LINK_KEY || String(env.RELAY_LINK_KEY).length < 24) throw new HttpError(501, 'signed links are not configured (RELAY_LINK_KEY)');
  return hmacHex(env.RELAY_LINK_KEY, `v-relay-link\n${id}\n${exp}`);
}

async function linkAllowed(url, env, id) {
  const exp = url.searchParams.get('exp');
  const sig = url.searchParams.get('sig');
  if (!exp || !sig || !/^\d{10}$/.test(exp) || !/^[a-f0-9]{64}$/.test(sig)) return false;
  if (Number(exp) * 1000 < Date.now()) return false;
  const expected = await linkSignature(env, id, exp);
  return bytesEqual(encoder.encode(expected), encoder.encode(sig));
}

export function cleanName(raw) {
  const base = String(raw ?? '').split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f]/g, '').trim();
  const name = base === '.' || base === '..' ? '' : base;
  return (name || 'file').slice(0, 200);
}

function intHeader(value) {
  if (value == null || !/^\d+$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : null;
}

// Parses a single "bytes=" range. Returns null for no/unsupported range (serve
// the whole object), or an R2 range option.
export function parseRange(header) {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === '' && m[2] === '')) return null;
  if (m[1] === '') return {suffix: Number(m[2])};
  const offset = Number(m[1]);
  if (m[2] === '') return {offset};
  const end = Number(m[2]);
  if (end < offset) throw new HttpError(416, 'bad range');
  return {offset, length: end - offset + 1};
}

function describe(object) {
  const meta = object.customMetadata ?? {};
  return {
    id: object.key.slice(2),
    name: meta.name ?? null,
    size: object.size,
    sha256: meta.sha256 ?? null,
    by: meta.by ?? null,
    uploaded: object.uploaded instanceof Date ? object.uploaded.toISOString() : object.uploaded ?? null,
    etag: object.httpEtag ?? null,
  };
}

function objectHeaders(object) {
  const meta = object.customMetadata ?? {};
  const headers = new Headers({
    'content-type': 'application/octet-stream',
    'accept-ranges': 'bytes',
    'cache-control': 'private, no-store',
    'x-relay-size': String(object.size),
  });
  if (object.httpEtag) headers.set('etag', object.httpEtag);
  if (meta.sha256) headers.set('x-relay-sha256', meta.sha256);
  if (meta.name) {
    headers.set('x-relay-name', encodeURIComponent(meta.name));
    headers.set('content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(meta.name)}`);
  }
  return headers;
}

async function readJson(request, limit = 4 * MiB) {
  const length = intHeader(request.headers.get('content-length'));
  if (length != null && length > limit) throw new HttpError(413, 'body too large');
  const text = await request.text();
  if (text.length > limit) throw new HttpError(413, 'body too large');
  try { return JSON.parse(text || '{}'); } catch { throw new HttpError(400, 'invalid JSON'); }
}

function limits(env) {
  const allowSmall = String(env.ALLOW_SMALL_PARTS ?? '') === '1';
  return {
    minPart: allowSmall ? 1 : MIN_PART_BYTES,
    maxObject: intHeader(String(env.MAX_OBJECT_BYTES ?? '')) ?? DEFAULT_MAX_OBJECT_BYTES,
  };
}

async function createUpload(request, env, by) {
  const body = await readJson(request);
  const {minPart, maxObject} = limits(env);
  const size = body.size;
  const partSize = body.partSize;
  if (!Number.isSafeInteger(size) || size < 1 || size > maxObject) throw new HttpError(400, `size must be 1..${maxObject}`);
  if (!Number.isSafeInteger(partSize) || partSize < minPart || partSize > MAX_PART_BYTES) throw new HttpError(400, `partSize must be ${minPart}..${MAX_PART_BYTES}`);
  if (Math.ceil(size / partSize) > MAX_PARTS) throw new HttpError(400, `more than ${MAX_PARTS} parts; raise partSize`);
  if (!SHA256_RE.test(body.sha256 ?? '')) throw new HttpError(400, 'sha256 must be 64 lowercase hex');
  const id = newId();
  const upload = await env.BUCKET.createMultipartUpload(objectKey(id), {
    httpMetadata: {contentType: 'application/octet-stream'},
    customMetadata: {name: cleanName(body.name), size: String(size), sha256: body.sha256, partSize: String(partSize), by, createdAt: new Date().toISOString()},
  });
  return json(201, {id, uploadId: upload.uploadId, partSize, parts: Math.ceil(size / partSize), maxPartBytes: MAX_PART_BYTES});
}

async function putSmall(request, env, by) {
  const length = intHeader(request.headers.get('content-length'));
  if (length == null) throw new HttpError(411, 'content-length required');
  if (length > MAX_PART_BYTES) throw new HttpError(413, `single-shot upload is limited to ${MAX_PART_BYTES} bytes; use multipart`);
  const sha256 = request.headers.get('x-relay-sha256') ?? '';
  if (!SHA256_RE.test(sha256)) throw new HttpError(400, 'x-relay-sha256 must be 64 lowercase hex');
  const name = cleanName(decodeURIComponent(request.headers.get('x-relay-name') ?? 'file'));
  const id = newId();
  // R2 verifies the sha256 itself and rejects a mismatching body.
  const object = await env.BUCKET.put(objectKey(id), length === 0 ? new Uint8Array(0) : request.body, {
    sha256,
    httpMetadata: {contentType: 'application/octet-stream'},
    customMetadata: {name, size: String(length), sha256, partSize: '0', by, createdAt: new Date().toISOString()},
  });
  if (!object) throw new HttpError(500, 'put failed');
  if (object.size !== length) {
    await env.BUCKET.delete(objectKey(id));
    throw new HttpError(409, `stored ${object.size} bytes, expected ${length}`);
  }
  return json(201, describe(object));
}

async function uploadPart(request, env, id, partNumber) {
  const uploadId = request.headers.get('x-relay-upload-id');
  if (!uploadId) throw new HttpError(400, 'x-relay-upload-id required');
  if (!Number.isSafeInteger(partNumber) || partNumber < 1 || partNumber > MAX_PARTS) throw new HttpError(400, 'bad part number');
  const length = intHeader(request.headers.get('content-length'));
  if (length == null) throw new HttpError(411, 'content-length required');
  if (length < 1 || length > MAX_PART_BYTES) throw new HttpError(413, `part must be 1..${MAX_PART_BYTES} bytes`);
  const upload = env.BUCKET.resumeMultipartUpload(objectKey(id), uploadId);
  const part = await upload.uploadPart(partNumber, request.body);
  return json(200, {partNumber: part.partNumber, etag: part.etag});
}

async function completeUpload(request, env, id) {
  const body = await readJson(request);
  if (!body.uploadId) throw new HttpError(400, 'uploadId required');
  if (!Array.isArray(body.parts) || body.parts.length < 1 || body.parts.length > MAX_PARTS) throw new HttpError(400, 'parts required');
  const parts = body.parts.map(p => ({partNumber: Number(p.partNumber), etag: String(p.etag ?? '')}));
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].partNumber !== i + 1 || !parts[i].etag) throw new HttpError(400, 'parts must be 1..N in order with etags');
  }
  const upload = env.BUCKET.resumeMultipartUpload(objectKey(id), body.uploadId);
  const object = await upload.complete(parts);
  const head = await env.BUCKET.head(objectKey(id));
  const expected = Number(head?.customMetadata?.size);
  if (!head || head.size !== expected) {
    await env.BUCKET.delete(objectKey(id));
    throw new HttpError(409, `stored ${head?.size ?? object?.size} bytes, expected ${expected}; object deleted`);
  }
  return json(200, describe(head));
}

async function abortUpload(request, env, id) {
  const uploadId = request.headers.get('x-relay-upload-id');
  if (!uploadId) throw new HttpError(400, 'x-relay-upload-id required');
  await env.BUCKET.resumeMultipartUpload(objectKey(id), uploadId).abort();
  return json(200, {aborted: id});
}

async function getObject(request, env, id) {
  if (request.method === 'HEAD') {
    const head = await env.BUCKET.head(objectKey(id));
    if (!head) throw new HttpError(404, 'not found');
    return new Response(null, {status: 200, headers: (() => { const h = objectHeaders(head); h.set('content-length', String(head.size)); return h; })()});
  }
  const range = parseRange(request.headers.get('range'));
  let object;
  try {
    object = await env.BUCKET.get(objectKey(id), range ? {range} : {});
  } catch (error) {
    if (range) {
      const head = await env.BUCKET.head(objectKey(id));
      if (!head) throw new HttpError(404, 'not found');
      return new Response(null, {status: 416, headers: {'content-range': `bytes */${head.size}`}});
    }
    throw error;
  }
  if (!object) throw new HttpError(404, 'not found');
  const headers = objectHeaders(object);
  if (!range) {
    headers.set('content-length', String(object.size));
    return new Response(object.body, {status: 200, headers});
  }
  let start, length;
  if (range.suffix != null) {
    length = Math.min(range.suffix, object.size);
    start = object.size - length;
  } else {
    start = range.offset;
    if (start >= object.size) return new Response(null, {status: 416, headers: {'content-range': `bytes */${object.size}`}});
    length = Math.min(range.length ?? object.size - start, object.size - start);
  }
  headers.set('content-length', String(length));
  headers.set('content-range', `bytes ${start}-${start + length - 1}/${object.size}`);
  return new Response(object.body, {status: 206, headers});
}

async function listObjects(url, env) {
  const cursor = url.searchParams.get('cursor') || undefined;
  const listed = await env.BUCKET.list({prefix: 'o/', cursor, limit: 1000, include: ['customMetadata']});
  return json(200, {objects: listed.objects.map(describe), truncated: Boolean(listed.truncated), cursor: listed.truncated ? listed.cursor : null});
}

async function makeLink(request, url, env, id) {
  const body = await readJson(request);
  const ttl = Number(body.ttlSeconds ?? 24 * 3600);
  if (!Number.isInteger(ttl) || ttl < 60 || ttl > MAX_LINK_SECONDS) throw new HttpError(400, `ttlSeconds must be 60..${MAX_LINK_SECONDS}`);
  const head = await env.BUCKET.head(objectKey(id));
  if (!head) throw new HttpError(404, 'not found');
  const exp = String(Math.floor(Date.now() / 1000) + ttl);
  const sig = await linkSignature(env, id, exp);
  const link = new URL(`/v1/objects/${id}`, url.origin);
  link.searchParams.set('exp', exp);
  link.searchParams.set('sig', sig);
  return json(200, {url: link.toString(), expiresAt: new Date(Number(exp) * 1000).toISOString()});
}

export async function handle(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method;
  if (path === '/v1/health' && method === 'GET') return json(200, {ok: true, service: 'v-relay'});

  const objectMatch = /^\/v1\/objects\/([^/]+)$/.exec(path);
  if (objectMatch && (method === 'GET' || method === 'HEAD') && url.searchParams.has('sig')) {
    const id = objectMatch[1];
    if (!ID_RE.test(id) || !(await linkAllowed(url, env, id))) throw new HttpError(403, 'link invalid or expired');
    return getObject(request, env, id);
  }

  const by = await authenticate(request, env);
  if (!by) throw new HttpError(401, 'unauthorized');

  if (path === '/v1/uploads' && method === 'POST') return createUpload(request, env, by);
  if (path === '/v1/objects' && method === 'POST') return putSmall(request, env, by);
  if (path === '/v1/objects' && method === 'GET') return listObjects(url, env);

  let m = /^\/v1\/uploads\/([^/]+)\/parts\/(\d+)$/.exec(path);
  if (m && method === 'PUT') { if (!ID_RE.test(m[1])) throw new HttpError(400, 'bad id'); return uploadPart(request, env, m[1], Number(m[2])); }
  m = /^\/v1\/uploads\/([^/]+)\/complete$/.exec(path);
  if (m && method === 'POST') { if (!ID_RE.test(m[1])) throw new HttpError(400, 'bad id'); return completeUpload(request, env, m[1]); }
  m = /^\/v1\/uploads\/([^/]+)$/.exec(path);
  if (m && method === 'DELETE') { if (!ID_RE.test(m[1])) throw new HttpError(400, 'bad id'); return abortUpload(request, env, m[1]); }
  m = /^\/v1\/objects\/([^/]+)\/link$/.exec(path);
  if (m && method === 'POST') { if (!ID_RE.test(m[1])) throw new HttpError(400, 'bad id'); return makeLink(request, url, env, m[1]); }
  if (objectMatch) {
    const id = objectMatch[1];
    if (!ID_RE.test(id)) throw new HttpError(400, 'bad id');
    if (method === 'GET' || method === 'HEAD') return getObject(request, env, id);
    if (method === 'DELETE') { await env.BUCKET.delete(objectKey(id)); return json(200, {deleted: id}); }
  }
  throw new HttpError(404, 'no such route');
}

export default {
  async fetch(request, env) {
    try {
      return await handle(request, env);
    } catch (error) {
      const text = String(error?.message ?? error).slice(0, 300);
      // R2 binding errors carry the S3-style code in the message.
      const r2Status = /NoSuchUpload|10024/.test(text) ? 404 : /InvalidPart|EntityTooSmall|10025|10011/.test(text) ? 400 : null;
      const status = error instanceof HttpError ? error.status : r2Status ?? 500;
      const message = error instanceof HttpError ? error.message : r2Status ? `r2: ${text}` : `internal error: ${text}`;
      return json(status, {error: message});
    }
  },
};
