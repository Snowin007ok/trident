/**
 * Historical Event of the Day — live data from Wikimedia.
 *
 * External source: the Wikimedia "On this day" feed. It needs no API key and no
 * credentials, so nothing secret lives in this file.
 *
 * Everything that knows the shape of the remote service — the URL and the
 * translation from its JSON into TRIDENT's own event shape — is confined to
 * `requestOnThisDay()` below. Wikifeeds routes have been deprecated before, so
 * when this one changes, that single function is the only thing to rewrite; the
 * cache, the fallbacks and every caller stay as they are.
 *
 * Two rules the rest of the app depends on:
 *   1. At most one successful request per date. A success is cached under
 *      `trident:wikimedia-event:YYYY-MM-DD` and served from there afterwards.
 *   2. Remote content is text, never markup. Anything the feed sends is run
 *      through toPlainText() before it can reach the DOM.
 */

const CACHE_PREFIX = 'trident:wikimedia-event:';
const LEGACY_PREFIX = 'trident.otd.';     // the first prototype's key
const TIMEOUT_MS = 9000;

/* ------------------------------------------------------------ sanitising */

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '–', mdash: '—', hellip: '…', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”'
};

/**
 * Remote content is treated as untrusted text. Tags are stripped rather than
 * parsed, and entities are decoded from a fixed table, so nothing from the feed
 * is ever handed to an HTML parser.
 */
export function toPlainText(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeChar(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => safeChar(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (m, name) => (ENTITIES[name.toLowerCase()] !== undefined ? ENTITIES[name.toLowerCase()] : m))
    .replace(/\s+/g, ' ')
    .trim();
}

function safeChar(code) {
  if (!Number.isFinite(code) || code < 32 || code > 0x10ffff) return '';
  try { return String.fromCodePoint(code); } catch (err) { return ''; }
}

/** Only http(s) URLs from Wikimedia's own hosts are allowed through. */
function safeUrl(value, { imagesOnly = false } = {}) {
  if (typeof value !== 'string') return null;
  let url;
  try { url = new URL(value, 'https://en.wikipedia.org'); } catch (err) { return null; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.toLowerCase();
  const allowed = imagesOnly
    ? /(^|\.)wikimedia\.org$/.test(host) || /(^|\.)wikipedia\.org$/.test(host)
    : /(^|\.)wikipedia\.org$/.test(host) || /(^|\.)wikimedia\.org$/.test(host);
  return allowed ? url.href : null;
}

/* ---------------------------------------------------------------- cache */

export function cacheKey(dateKey) { return CACHE_PREFIX + dateKey; }

export function readCache(dateKey) {
  try {
    const raw = localStorage.getItem(cacheKey(dateKey));
    if (raw) return JSON.parse(raw);
    // a cache written by the first prototype is still good data
    const legacy = localStorage.getItem(LEGACY_PREFIX + dateKey);
    return legacy ? JSON.parse(legacy) : null;
  } catch (err) {
    return null;
  }
}

function writeCache(dateKey, payload) {
  try {
    localStorage.setItem(cacheKey(dateKey), JSON.stringify(payload));
  } catch (err) {
    /* a full or blocked store is not fatal — the app simply refetches next time */
  }
}

function hasUsableCache(dateKey) {
  const c = readCache(dateKey);
  return !!(c && Array.isArray(c.events) && c.events.length);
}

/* ------------------------------------------------- the service adapter --- */

/**
 * THE ONLY FUNCTION THAT KNOWS ABOUT WIKIMEDIA.
 * Takes a month and day, returns TRIDENT event objects. Replace the URL and the
 * mapping here if the feed moves; nothing outside this function changes.
 */
async function requestOnThisDay(month, day, dateKey, signal) {
  const endpoint = `https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday/events/${month}/${day}`;

  const res = await fetch(endpoint, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`feed responded with ${res.status}`);
  const json = await res.json();

  const raw = Array.isArray(json.events) ? json.events : [];
  return raw
    .filter((e) => e && e.year && typeof e.text === 'string')
    .map((evt) => {
      const page = (evt.pages && evt.pages[0]) || {};
      const thumb = page.thumbnail || null;
      const imageSrc = thumb ? safeUrl(thumb.source, { imagesOnly: true }) : null;
      const title = toPlainText((page.titles && page.titles.normalized) || page.title || 'Event');
      return {
        id: `${dateKey}:${evt.year}:${toPlainText((page.titles && page.titles.canonical) || page.title || 'event')}`,
        date: dateKey,
        year: toPlainText(String(evt.year)),
        title,
        text: toPlainText(evt.text),
        extract: toPlainText(page.extract || ''),
        image: imageSrc
          ? { src: imageSrc, width: Number(thumb.width) || null, height: Number(thumb.height) || null }
          : null,
        url: safeUrl((page.content_urls && page.content_urls.desktop && page.content_urls.desktop.page) || '')
          || `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title || title)}`,
        source: 'Wikipedia, via the Wikimedia “On this day” feed'
      };
    })
    .filter((e) => e.text);
}

/* ------------------------------------------------------------- fetching */

// one in-flight request per date, so two renders in the same tick share a call
const inFlight = new Map();

/**
 * Events for a date.
 * Returns { status, events }:
 *   'cache-hit' — already fetched for this date, served from localStorage
 *   'fresh'     — network call succeeded and was cached under this date
 *   'cache'     — network failed, but this date was cached earlier
 *   'empty'     — the feed answered with nothing for this date
 *   'offline'   — network failed and nothing is cached for this date
 */
export async function fetchEventsForDate(dateKey) {
  if (hasUsableCache(dateKey)) {
    return { status: 'cache-hit', events: readCache(dateKey).events };
  }
  if (inFlight.has(dateKey)) return inFlight.get(dateKey);

  const [, month, day] = dateKey.split('-');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const job = (async () => {
    try {
      const events = await requestOnThisDay(month, day, dateKey, controller.signal);
      if (!events.length) return { status: 'empty', events: [] };
      writeCache(dateKey, { events, fetchedAt: new Date().toISOString() });
      return { status: 'fresh', events };
    } catch (err) {
      const fallback = readCache(dateKey);
      if (fallback && Array.isArray(fallback.events) && fallback.events.length) {
        return { status: 'cache', events: fallback.events };
      }
      return { status: 'offline', events: [] };
    } finally {
      clearTimeout(timer);
      inFlight.delete(dateKey);
    }
  })();

  inFlight.set(dateKey, job);
  return job;
}

/** True when this date has already been fetched successfully at least once. */
export function isCached(dateKey) { return hasUsableCache(dateKey); }
