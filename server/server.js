/**
 * TRIDENT server: the existing static application, plus one endpoint.
 *
 *   GET  /*                  the app, exactly as before
 *   GET  /api/daily-brief      whether the feature is switched on (never the key)
 *   POST /api/daily-brief      an anonymous progress summary -> a checked briefing
 *   POST /api/daily-brief/ask  the same summary + one question -> a scoped answer
 *   GET  /api/images/europeana one topic -> up to six licensed records, or 501
 *                              when no EUROPEANA_API_KEY is configured. The key
 *                              is read here and never sent to the browser.
 *
 * Node's own http module — the only dependency in this project is the Gemini
 * SDK, and that is loaded lazily, so the app still serves with nothing
 * installed.
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LIMITS, PORT, hasApiKey, GEMINI_MODEL } from './config.js';
import { brief, askGuide } from './brief.js';
import { searchEuropeana, isConfigured as europeanaConfigured } from './europeana.js';

const APP_ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));

/** Never served, whatever the request asks for. */
const BLOCKED = [/(^|[\\/])\./, /^server[\\/]/, /^node_modules[\\/]/, /^package(-lock)?\.json$/];

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8'
};

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store'
  });
  res.end(payload);
}

function clientId(req) {
  return req.socket.remoteAddress || 'unknown';
}

/* ------------------------------------------------------------- rate limit */

const buckets = new Map();

export function rateLimit(id) {
  const now = Date.now();
  const hits = (buckets.get(id) || []).filter((t) => now - t < LIMITS.rateWindowMs);
  if (hits.length >= LIMITS.rateMaxRequests) {
    buckets.set(id, hits);
    return { allowed: false, retryAfterSec: Math.ceil((LIMITS.rateWindowMs - (now - hits[0])) / 1000) };
  }
  hits.push(now);
  buckets.set(id, hits);
  return { allowed: true };
}

export function resetRateLimits() { buckets.clear(); }

async function readBody(req) {
  return new Promise((resolvePromise, reject) => {
    let size = 0;
    const parts = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > LIMITS.maxBodyBytes) {
        reject(Object.assign(new Error('body too large'), { tooLarge: true }));
        req.destroy();
        return;
      }
      parts.push(chunk);
    });
    req.on('end', () => resolvePromise(Buffer.concat(parts).toString('utf8')));
    req.on('error', reject);
  });
}

/* --------------------------------------------------------- static serving */

async function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname).replace(/^\/+/, '');
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  rel = normalize(rel);

  if (rel.startsWith('..') || rel.includes(`..${sep}`) || BLOCKED.some((re) => re.test(rel))) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
    return;
  }

  const full = join(APP_ROOT, rel);
  if (!full.startsWith(APP_ROOT + sep)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
    return;
  }

  try {
    const info = await stat(full);
    if (!info.isFile()) throw new Error('not a file');
    const body = await readFile(full);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(full).toLowerCase()] || 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': 'no-cache'
    });
    res.end(body);
  } catch (err) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
}

/* ----------------------------------------------------------------- routes */

export function createApp(deps = {}) {
  return createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');

    if (url.pathname === '/api/daily-brief/ask') {
      if (req.method !== 'POST') {
        res.writeHead(405, { Allow: 'POST' });
        res.end();
        return;
      }

      const gate = rateLimit(clientId(req));
      if (!gate.allowed) {
        sendJson(res, 429, {
          ok: false,
          reason: 'rate-limited',
          message: `Your Daily Guide is limited to ${LIMITS.rateMaxRequests} questions a minute. Please wait about ${gate.retryAfterSec} seconds.`
        });
        return;
      }

      let payload;
      try {
        payload = JSON.parse(await readBody(req) || '{}');
      } catch (err) {
        sendJson(res, 400, { ok: false, error: 'bad-request', message: 'That question could not be read.' });
        return;
      }

      try {
        const result = await askGuide(payload, deps);
        sendJson(res, result.status, result.body);
      } catch (err) {
        console.error('Daily Guide: unexpected failure answering a question.');
        sendJson(res, 500, { ok: false, reason: 'unavailable', message: 'Your Daily Guide is temporarily unavailable.' });
      }
      return;
    }

    if (url.pathname === '/api/images/europeana') {
      if (req.method !== 'GET') {
        res.writeHead(405, { Allow: 'GET' });
        res.end();
        return;
      }
      if (!europeanaConfigured()) {
        // the honest answer: this source is simply not set up here
        sendJson(res, 501, {
          status: 'not-configured', results: [],
          message: 'Europeana is not configured on this server. Set EUROPEANA_API_KEY to enable it.'
        });
        return;
      }
      const gate = rateLimit(clientId(req));
      if (!gate.allowed) {
        sendJson(res, 429, { status: 'rate-limited', results: [], retryAfterSec: gate.retryAfterSec });
        return;
      }
      const out = await searchEuropeana(url.searchParams.get('q') || '');
      sendJson(res, 200, out);
      return;
    }

    if (url.pathname === '/api/daily-brief') {
      // the browser asks whether the feature exists; it never learns the key
      if (req.method === 'GET') {
        sendJson(res, 200, { available: hasApiKey() });
        return;
      }
      if (req.method !== 'POST') {
        res.writeHead(405, { Allow: 'GET, POST' });
        res.end();
        return;
      }

      const gate = rateLimit(clientId(req));
      if (!gate.allowed) {
        sendJson(res, 429, {
          error: 'rate-limited',
          message: `The briefing is limited to ${LIMITS.rateMaxRequests} requests a minute. Please wait about ${gate.retryAfterSec} seconds.`
        });
        return;
      }

      let payload;
      try {
        payload = JSON.parse(await readBody(req) || '{}');
      } catch (err) {
        sendJson(res, 400, {
          error: err.tooLarge ? 'too-large' : 'bad-request',
          message: 'The briefing request could not be read.'
        });
        return;
      }

      try {
        const result = await brief(payload, deps);
        sendJson(res, result.status, result.body);
      } catch (err) {
        // the message is never echoed to the browser — it could carry internals
        console.error('Daily Briefing: unexpected failure building a briefing.');
        sendJson(res, 500, {
          error: 'unavailable',
          message: 'The personal briefing is temporarily unavailable.'
        });
      }
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      res.end();
      return;
    }
    await serveStatic(req, res, url.pathname);
  });
}

/* ------------------------------------------------------------------ start */

const isDirectRun = process.argv[1]
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  const server = createApp();
  server.listen(PORT, () => {
    console.log(`TRIDENT is serving on http://localhost:${PORT}`);
    if (hasApiKey()) {
      // the key is never printed — only whether one was found
      console.log(`Daily Briefing: enabled, using ${GEMINI_MODEL}.`);
    } else {
      console.log('Daily Briefing: disabled (no GEMINI_API_KEY found). The dashboard still shows a local briefing.');
    }
  });
}
